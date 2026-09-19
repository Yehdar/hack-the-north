"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, type GlobeDot } from "@/components/globe/Globe";
import { AgentBoot } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { HUB_POINTS, SEAT_POINTS } from "@/data/globePoints";
import { AnimatePresence, motion } from "framer-motion";

type Msg = {
  id: string;
  round: number;
  from: string;
  to: string;
  kind: FeedItem["kind"];
  text: string;
};
type Verdict = { agentId: string; stance: number; confidence: number; position: string };
type RosterEntry = { id: string; role: string; weight: number };

const ROUND_LABEL: Record<number, string> = {
  1: "Round 1 · independent, blind",
  2: "Round 2 · cross-examination",
  3: "Round 3 · rebuttal",
  4: "Round 4 · adversarial",
};

// 3 findings + 3 challenges + up to 3 rebuttals + 1 adversary
const EXPECTED_TURNS = 10;

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [running, setRunning] = useState(false);
  const [firm, setFirm] = useState("");
  const [provider, setProvider] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stances, setStances] = useState<Record<string, Verdict>>({});
  const [active, setActive] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  const [step, setStep] = useState("Idle");
  const [decision, setDecision] = useState<{ decision: string; score: number; dissents: string[] } | null>(null);
  const [mindChanges, setMindChanges] = useState<{ agentId: string; from: number; to: number; conceded: boolean }[]>([]);
  const sidebar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sidebar.current?.scrollTo({ top: sidebar.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  const run = useCallback(() => {
    setRunning(true);
    setMessages([]); setFeed([]); setStances({}); setDecision(null);
    setMindChanges([]); setRound(0); setStep("Convening");

    const es = new EventSource("/api/vc/deliberate");

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      switch (ev.type) {
        case "start":
          setFirm(ev.firm.name); setProvider(ev.provider); setRoster(ev.roster);
          setStep("Decomposing the decision");
          break;

        case "task":
          setActive((a) => new Set(a).add(ev.task.assignedTo));
          break;

        case "message": {
          const m: Msg = ev.message;
          setMessages((prev) => [...prev, m]);
          setRound(m.round);
          setStep(ROUND_LABEL[m.round] ?? "Deliberating");
          setFeed((f) => [
            { id: m.id, agent: m.from, message: m.text, kind: m.kind },
            ...f,
          ].slice(0, 5));
          break;
        }

        case "verdict":
          setStances((s) => ({ ...s, [ev.verdict.agentId]: ev.verdict }));
          setActive((a) => {
            const next = new Set(a);
            next.delete(ev.verdict.agentId);
            return next;
          });
          break;

        case "done":
          setDecision(ev.verdict);
          setMindChanges(ev.result.metrics.mindChanges);
          setStep("Committee concluded");
          setActive(new Set());
          setRunning(false);
          es.close();
          break;

        case "error":
          setStep("Failed"); setRunning(false); es.close();
          break;
      }
    };
    es.onerror = () => { setRunning(false); es.close(); };
  }, []);

  const dots: GlobeDot[] = [
    ...HUB_POINTS.map((h) => ({
      id: `hub:${h.id}`,
      lat: h.lat,
      lon: h.lon,
      label: h.label,
      weight: 0.25,
    })),
    ...Object.values(SEAT_POINTS).map((s) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      label: s.label,
      stance: stances[s.id]?.stance,
      weight: roster.find((r) => r.id === s.id)?.weight ?? 0.4,
      active: active.has(s.id),
    })),
  ];

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      {booting && <AgentBoot onComplete={() => setBooting(false)} />}

      <div className="flex h-full">
        {/* ------------------------------- globe ------------------------------- */}
        <div className="relative flex-1">
          <Globe
            dots={dots}
            focus={running || decision ? { lat: SEAT_POINTS.gp.lat, lon: SEAT_POINTS.gp.lon } : null}
            className="h-full w-full"
          />

          {/* header */}
          <div className="pointer-events-none absolute left-8 top-8 z-40">
            {!running && !decision && (
              <div className="pointer-events-auto">
                <h1 className="font-mono text-xl tracking-tight">Atlas</h1>
                <p className="mt-1 max-w-xs font-mono text-xs leading-relaxed text-white/50">
                  {firm || "An investment committee that argues with itself before it argues with you."}
                </p>
              </div>
            )}
            <AnimatePresence>
              {running && (
                <ProcessingPanel
                  step={step}
                  done={messages.length}
                  total={EXPECTED_TURNS}
                  round={round ? ROUND_LABEL[round] : undefined}
                />
              )}
            </AnimatePresence>
          </div>

          <AgentFeed items={feed} onDismiss={dismiss} />

          {/* controls */}
          <div className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2">
            <div className="flex items-center gap-3 border border-white/30 bg-black/90 p-2 backdrop-blur-md">
              <button
                onClick={run}
                disabled={running}
                className="bg-white px-5 py-2 font-mono text-xs uppercase tracking-widest text-black transition hover:bg-white/80 disabled:bg-white/20 disabled:text-white/40"
              >
                {running ? "Deliberating" : decision ? "Run again" : "Convene committee"}
              </button>
              <a
                href="/meeting"
                className="px-4 py-2 font-mono text-xs uppercase tracking-widest text-white/60 transition hover:text-white"
              >
                Defend it →
              </a>
              {provider && (
                <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-white/30">
                  {provider}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------ sidebar ------------------------------ */}
        <aside className="flex w-96 flex-col border-l border-white/10 bg-black">
          <div className="border-b border-white/10 p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              The room
            </h2>
            <div className="mt-3 space-y-2">
              {roster.filter((r) => r.weight > 0).map((r) => {
                const v = stances[r.id];
                return (
                  <div key={r.id} className="border border-white/15 p-2">
                    <div className="flex items-baseline justify-between font-mono text-xs">
                      <span className="text-white/90">{r.role}</span>
                      <span className="text-white/40">{(r.weight * 100).toFixed(0)}%</span>
                    </div>
                    <div className="relative mt-2 h-1 bg-white/10">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-white/30" />
                      {v && (
                        <motion.div
                          layout
                          className={`absolute top-0 h-full ${v.stance >= 0 ? "bg-emerald-400" : "bg-red-400"}`}
                          style={{
                            width: `${Math.abs(v.stance) * 50}%`,
                            left: v.stance >= 0 ? "50%" : `${50 - Math.abs(v.stance) * 50}%`,
                          }}
                        />
                      )}
                    </div>
                    {v && (
                      <p className="mt-1 font-mono text-[10px] text-white/40">
                        {v.stance.toFixed(2)} · conf {v.confidence.toFixed(2)}
                      </p>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && (
                <p className="font-mono text-xs text-white/30">Not yet convened.</p>
              )}
            </div>
          </div>

          <div ref={sidebar} className="flex-1 overflow-y-auto p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              Transcript
            </h2>
            <div className="mt-3 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="border-l-2 border-white/20 pl-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    {m.from} {m.to === "room" ? "→ room" : `→ ${m.to}`} · {m.kind}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/80">{m.text}</p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="font-mono text-xs text-white/30">Nothing said yet.</p>
              )}
            </div>
          </div>

          {(decision || mindChanges.length > 0) && (
            <div className="border-t border-white/10 p-4">
              {mindChanges.length > 0 && (
                <div className="mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-emerald-500">
                    Minds changed
                  </h2>
                  {mindChanges.map((c) => (
                    <p key={c.agentId} className="mt-1 font-mono text-[11px] text-white/70">
                      {c.agentId} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                      {c.conceded && <span className="ml-1 text-emerald-400">conceded</span>}
                    </p>
                  ))}
                </div>
              )}
              {decision && (
                <>
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                    Verdict
                  </h2>
                  <p
                    className={`mt-1 font-mono text-2xl uppercase ${
                      decision.decision === "invest"
                        ? "text-emerald-400"
                        : decision.decision === "pass"
                          ? "text-red-400"
                          : "text-amber-400"
                    }`}
                  >
                    {decision.decision}
                  </p>
                  <p className="font-mono text-[11px] text-white/40">
                    score {decision.score.toFixed(3)}
                    {decision.dissents.length > 0 && ` · dissent: ${decision.dissents.join(", ")}`}
                  </p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
