"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, type GlobeDot } from "@/components/globe/Globe";
import { AgentBoot } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { HUB_POINTS, SEAT_POINTS } from "@/data/globePoints";
import { AnimatePresence, motion } from "framer-motion";
import { useVenture } from "@/lib/store";
import { FirmPicker } from "@/components/FirmPicker";
import { streamPost } from "@/lib/sse";
import { Intake } from "@/components/Intake";

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
  const [selected, setSelected] = useState<string | null>(null);
  const ventureFile = useVenture((v) => v.ventureFile);
  const replaceVenture = useVenture((v) => v.replace);
  const resetVenture = useVenture((v) => v.reset);
  const setDeliberation = useVenture((v) => v.setDeliberation);
  const firmId = useVenture((v) => v.firmId);
  const [showIntake, setShowIntake] = useState(false);
  const sidebar = useRef<HTMLDivElement>(null);

  // Intake opens once booting finishes and there is no file yet.
  useEffect(() => {
    if (!booting && !ventureFile) setShowIntake(true);
  }, [booting, ventureFile]);

  useEffect(() => {
    sidebar.current?.scrollTo({ top: sidebar.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  const run = useCallback(() => {
    if (!ventureFile) {
      setShowIntake(true);
      return;
    }

    setRunning(true);
    setMessages([]); setFeed([]); setStances({}); setDecision(null);
    setMindChanges([]); setRound(0); setStep("Convening"); setSelected(null);

    void streamPost("/api/vc/deliberate", { ventureFile, firmId }, (ev) => {
      switch (ev.type) {
        case "start": {
          const firmInfo = ev.firm as { name: string };
          setFirm(firmInfo.name);
          setProvider(ev.provider as string);
          setRoster(ev.roster as RosterEntry[]);
          setStep("Decomposing the decision");
          break;
        }

        case "task":
          setActive((a) => new Set(a).add((ev.task as { assignedTo: string }).assignedTo));
          break;

        case "message": {
          const m = ev.message as Msg;
          setMessages((prev) => [...prev, m]);
          setRound(m.round);
          setStep(ROUND_LABEL[m.round] ?? "Deliberating");
          setFeed((f) =>
            [{ id: m.id, agent: m.from, message: m.text, kind: m.kind }, ...f].slice(0, 5)
          );
          break;
        }

        case "verdict": {
          const v = ev.verdict as Verdict;
          setStances((s) => ({ ...s, [v.agentId]: v }));
          setActive((a) => {
            const next = new Set(a);
            next.delete(v.agentId);
            return next;
          });
          break;
        }

        case "done": {
          const result = ev.result as {
            metrics: { mindChanges: typeof mindChanges } & Record<string, never>;
            finalVerdicts: never[];
            messages: never[];
          };
          setDeliberation({
            firm,
            verdicts: result.finalVerdicts,
            messages: result.messages,
            roster,
            metrics: result.metrics as never,
          });
          setDecision(ev.verdict as typeof decision);
          setMindChanges(result.metrics.mindChanges);
          setStep("Committee concluded");
          setActive(new Set());
          setRunning(false);
          // Persist the verdict onto the venture file so the report and the
          // meeting both see it.
          replaceVenture({ ...ventureFile, verdict: ev.verdict as never });
          break;
        }

        case "error":
          setStep("Failed");
          setRunning(false);
          break;
      }
    }).catch(() => {
      setStep("Failed");
      setRunning(false);
    });
  }, [ventureFile, replaceVenture, setDeliberation, firm, roster, firmId]);

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
    <main className="relative h-screen overflow-hidden bg-ground text-white">
      {booting && <AgentBoot onComplete={() => setBooting(false)} />}
      <AnimatePresence>
        {showIntake && !booting && <Intake onDone={() => setShowIntake(false)} />}
      </AnimatePresence>

      <div className="flex h-full">
        {/* ------------------------------- globe ------------------------------- */}
        <div className="relative flex-1">
          <Globe
            dots={dots}
            onDotClick={(id) => setSelected(id.startsWith("hub:") ? null : id)}
            focus={running || decision ? { lat: SEAT_POINTS.gp.lat, lon: SEAT_POINTS.gp.lon } : null}
            className="h-full w-full"
          />

          {/* header */}
          <div className="pointer-events-none absolute left-8 top-8 z-40">
            {!running && !decision && (
              <div className="pointer-events-auto">
                <h1 className="font-mono text-xl tracking-tight">Vision</h1>
                {ventureFile ? (
                  <>
                    <p className="mt-2 max-w-xs font-mono text-xs leading-relaxed text-muted">
                      &ldquo;{ventureFile.solution}&rdquo;
                    </p>
                    <button
                      onClick={() => {
                        resetVenture();
                        setShowIntake(true);
                      }}
                      className="mt-2 font-mono text-[10px] uppercase tracking-widest text-faint underline-offset-4 hover:text-muted hover:underline"
                    >
                      Different idea
                    </button>
                  </>
                ) : (
                  <p className="mt-1 max-w-xs font-mono text-xs leading-relaxed text-muted">
                    {firm || "An investment committee that argues with itself before it argues with you."}
                  </p>
                )}
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

          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="absolute bottom-28 left-8 z-40 w-96 border border-edge-bright bg-surface/95 p-4 backdrop-blur-md"
              >
                {(() => {
                  const entry = roster.find((r) => r.id === selected);
                  const v = stances[selected];
                  const said = messages.filter((m) => m.from === selected);
                  const against = messages.filter((m) => m.to === selected);
                  const moved = mindChanges.find((c) => c.agentId === selected);

                  return (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm text-white">
                            {entry?.role ?? selected}
                          </p>
                          <p className="font-mono text-[10px] uppercase tracking-widest text-faint">
                            weight {((entry?.weight ?? 0) * 100).toFixed(0)}% ·{" "}
                            {v ? `stance ${v.stance.toFixed(2)} · conf ${v.confidence.toFixed(2)}` : "no position yet"}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          className="px-2 font-mono text-xs text-faint hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {v && (
                        <p className="mt-3 text-xs leading-relaxed text-ink/85">{v.position}</p>
                      )}

                      {moved && (
                        <p className="mt-3 border border-emerald-900/60 bg-emerald-950/20 p-2 font-mono text-[11px] text-emerald-300">
                          moved {moved.from.toFixed(2)} → {moved.to.toFixed(2)}
                          {moved.conceded && " after conceding"}
                        </p>
                      )}

                      {against.length > 0 && (
                        <div className="mt-3">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-500">
                            Challenged by
                          </p>
                          {against.map((m) => (
                            <p key={m.id} className="mt-1 text-[11px] leading-relaxed text-muted">
                              <span className="font-mono text-faint">{m.from}: </span>
                              {m.text}
                            </p>
                          ))}
                        </div>
                      )}

                      {said.length > 0 && (
                        <p className="mt-3 font-mono text-[10px] text-faint">
                          {said.length} contribution{said.length === 1 ? "" : "s"} this session
                        </p>
                      )}
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* controls */}
          <div className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2">
            <div className="flex items-center gap-3 border border-edge-bright bg-surface/90 p-2 backdrop-blur-md">
              <FirmPicker disabled={running} />
              <button
                onClick={run}
                disabled={running}
                className="bg-white px-5 py-2 font-mono text-xs uppercase tracking-widest text-black transition hover:bg-white/80 disabled:bg-white/20 disabled:text-faint"
              >
                {running ? "Deliberating" : decision ? "Run again" : "Convene committee"}
              </button>
              <a
                href="/meeting"
                className="px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted transition hover:text-white"
              >
                Defend it →
              </a>
              {decision && (
                <a
                  href="/report"
                  className="px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted transition hover:text-white"
                >
                  Report →
                </a>
              )}
              {provider && (
                <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-faint">
                  {provider}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------ sidebar ------------------------------ */}
        <aside className="flex w-96 flex-col border-l border-edge bg-ground">
          <div className="border-b border-edge p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-faint">
              The room
            </h2>
            <div className="mt-3 space-y-2">
              {roster.filter((r) => r.weight > 0).map((r) => {
                const v = stances[r.id];
                return (
                  <div key={r.id} className="border border-edge p-2">
                    <div className="flex items-baseline justify-between font-mono text-xs">
                      <span className="text-ink">{r.role}</span>
                      <span className="text-faint">{(r.weight * 100).toFixed(0)}%</span>
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
                      <p className="mt-1 font-mono text-[10px] text-faint">
                        {v.stance.toFixed(2)} · conf {v.confidence.toFixed(2)}
                      </p>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && (
                <p className="font-mono text-xs text-faint">Not yet convened.</p>
              )}
            </div>
          </div>

          <div ref={sidebar} className="flex-1 overflow-y-auto p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-faint">
              Transcript
            </h2>
            <div className="mt-3 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className="border-l-2 border-edge-bright pl-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-faint">
                    {m.from} {m.to === "room" ? "→ room" : `→ ${m.to}`} · {m.kind}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink/85">{m.text}</p>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="font-mono text-xs text-faint">Nothing said yet.</p>
              )}
            </div>
          </div>

          {(decision || mindChanges.length > 0) && (
            <div className="border-t border-edge p-4">
              {mindChanges.length > 0 && (
                <div className="mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-emerald-500">
                    Minds changed
                  </h2>
                  {mindChanges.map((c) => (
                    <p key={c.agentId} className="mt-1 font-mono text-[11px] text-muted">
                      {c.agentId} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                      {c.conceded && <span className="ml-1 text-emerald-400">conceded</span>}
                    </p>
                  ))}
                </div>
              )}
              {decision && (
                <>
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-faint">
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
                  <p className="font-mono text-[11px] text-faint">
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
