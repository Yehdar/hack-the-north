"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, type GlobeDot } from "@/components/globe/Globe";
import { AgentBoot } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { Intake } from "@/components/Intake";
import { useVenture } from "@/lib/store";
import { streamPost } from "@/lib/sse";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";

// ============================================================================
// PART 1 — DISCOVERY.
//
// Seven beats, each with something moving:
//   intake -> split -> deploy -> react -> REVEAL -> council -> hand to Part 2
//
// The reveal is the one that matters. Every other beat exists to earn it.
// ============================================================================

type DeployedPersona = {
  id: number;
  name: string;
  title: string;
  hubId: string;
  lat: number;
  lon: number;
  city: string;
  why: string[];
};

type Phase = "idle" | "problems" | "deploy" | "react" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  problems: "Splitting the solution",
  deploy: "Deploying the crowd",
  react: "Listening",
  done: "The market has spoken",
};

export default function Discover() {
  const [booting, setBooting] = useState(true);
  const [showIntake, setShowIntake] = useState(false);

  const ventureFile = useVenture((v) => v.ventureFile);
  const replaceVenture = useVenture((v) => v.replace);
  const resetVenture = useVenture((v) => v.reset);

  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState("");
  const [problems, setProblems] = useState<ProblemStatement[]>([]);
  const [personas, setPersonas] = useState<DeployedPersona[]>([]);
  const [reactions, setReactions] = useState<Map<number, CrowdReaction>>(new Map());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [verdict, setVerdict] = useState<CrowdVerdict | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [onlyEngaged, setOnlyEngaged] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // The stream callback closes over state at the moment run() was created, so
  // reading `personas` inside it yields the empty array it was born with.
  // Deployment and reactions arrive in the same stream, so the ref is the only
  // way the feed can name who is speaking.
  const personasRef = useRef<DeployedPersona[]>([]);

  useEffect(() => {
    if (!booting && !ventureFile) setShowIntake(true);
  }, [booting, ventureFile]);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  const run = useCallback(() => {
    if (!ventureFile) return setShowIntake(true);

    setRunning(true);
    setPhase("problems");
    setProblems([]); setPersonas([]); setReactions(new Map());
    setFeed([]); setVerdict(null); setShowReveal(false); setFocus(null);
    setProgress({ done: 0, total: 0 });
    personasRef.current = [];

    void streamPost(
      "/api/discovery/run",
      { solution: ventureFile.solution, crowdSize: 120 },
      (ev) => {
        switch (ev.type) {
          case "start":
            setProvider(ev.provider as string);
            break;

          case "phase":
            setPhase(ev.phase as Phase);
            break;

          case "problems":
            setProblems(ev.problems as ProblemStatement[]);
            break;

          case "deploy": {
            const deployed = ev.personas as DeployedPersona[];
            personasRef.current = deployed;
            setPersonas(deployed);
            setProgress({ done: 0, total: deployed.length });
            break;
          }

          case "reactions": {
            const batch = ev.batch as CrowdReaction[];
            setProgress({ done: ev.done as number, total: ev.total as number });
            setReactions((prev) => {
              const next = new Map(prev);
              for (const r of batch) next.set(r.personaId, r);
              return next;
            });
            // Only the ones with something to say reach the feed. A feed of
            // shrugs is noise.
            const worth = batch.filter((r) => r.reason && r.attention !== "ignore");
            if (worth.length > 0) {
              setFeed((f) =>
                [
                  ...worth.slice(0, 2).map((r) => ({
                    id: `r${r.personaId}`,
                    agent: personaName(personasRef.current, r.personaId),
                    message: r.reason,
                    kind: (r.sentiment > 0.6 ? "concession" : "challenge") as FeedItem["kind"],
                  })),
                  ...f,
                ].slice(0, 5)
              );
            }
            break;
          }

          case "verdict": {
            const v = ev.verdict as CrowdVerdict;
            setVerdict(v);
            setPhase("done");
            setRunning(false);
            if (v.mismatch) setTimeout(() => setShowReveal(true), 600);
            break;
          }

          case "error":
            setRunning(false);
            setPhase("idle");
            break;
        }
      }
    ).catch(() => {
      setRunning(false);
      setPhase("idle");
    });
  }, [ventureFile]);

  /** Accept the market's problem and carry it into Part 2. */
  const acceptMarketProblem = useCallback(() => {
    if (!ventureFile || !verdict?.marketProblemId) return;
    const chosen = problems.find((p) => p.id === verdict.marketProblemId);
    if (!chosen) return;

    replaceVenture({
      ...ventureFile,
      version: ventureFile.version + 1,
      extractedProblems: problems,
      chosenProblem: chosen,
    });
    setShowReveal(false);
  }, [ventureFile, verdict, problems, replaceVenture]);

  const visible = onlyEngaged
    ? personas.filter((p) => reactions.get(p.id)?.attention === "full")
    : personas;

  // One label per city, not one per person. 120 dots each carrying their city
  // name renders "SAN FRANCISCO" sixty times on top of itself.
  const labelled = new Set<string>();

  const dots: GlobeDot[] = visible.map((p) => {
    const r = reactions.get(p.id);
    const firstOfCity = !labelled.has(p.city);
    if (firstOfCity) labelled.add(p.city);

    return {
      id: `p${p.id}`,
      lat: p.lat,
      lon: p.lon,
      label: firstOfCity ? p.city : "",
      stance: r ? r.sentiment * 2 - 1 : undefined,
      weight: r?.attention === "full" ? 0.8 : r?.attention === "partial" ? 0.45 : 0.2,
      active: running && !r,
    };
  });

  const marketProblem = problems.find((p) => p.id === verdict?.marketProblemId);
  const pitchedProblem = problems.find((p) => p.id === verdict?.pitchedProblemId);
  const focused = focus ? personas.find((p) => p.id === focus) : null;

  return (
    <main className="relative h-screen overflow-hidden bg-ground text-ink">
      {booting && <AgentBoot onComplete={() => setBooting(false)} />}
      <AnimatePresence>
        {showIntake && !booting && <Intake onDone={() => setShowIntake(false)} />}
      </AnimatePresence>

      <div className="flex h-full">
        <div className="relative flex-1">
          <Globe dots={dots} onDotClick={(id) => setFocus(Number(id.slice(1)))} className="h-full w-full" />

          {/* ---------------------------------------------------- top left */}
          <div className="absolute left-6 top-6 z-40 w-[300px]">
            <AnimatePresence mode="wait">
              {running ? (
                <ProcessingPanel
                  key="proc"
                  step={PHASE_LABEL[phase]}
                  done={progress.done}
                  total={progress.total || 120}
                  round={provider ? `provider ${provider}` : undefined}
                />
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <h1 className="font-mono text-lg tracking-tight">Atlas</h1>
                  {ventureFile ? (
                    <>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        &ldquo;{ventureFile.solution}&rdquo;
                      </p>
                      <button
                        onClick={() => { resetVenture(); setShowIntake(true); }}
                        className="label mt-2 underline-offset-4 hover:text-ink hover:underline"
                      >
                        Different idea
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Submit a product. The market tells you which problem it actually solves.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* candidate problems */}
            <AnimatePresence>
              {problems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-1.5"
                >
                  <p className="label">Candidate problems</p>
                  {problems.map((p, i) => {
                    const vote = verdict?.problemVotes.find((v) => v.problemId === p.id);
                    const isMarket = verdict?.marketProblemId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`panel p-2.5 ${isMarket ? "glow-accent" : ""}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="num text-[10px] text-faint">
                            {p.id}
                            {i === 0 && " · pitched"}
                            {isMarket && <span className="text-accent"> · the market&apos;s</span>}
                          </span>
                          {vote && (
                            <span className="num text-[10px] text-muted">
                              {vote.votes} · {(vote.payRate * 100).toFixed(0)}% pay
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-ink/85">
                          {p.statement}
                        </p>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AgentFeed items={feed} onDismiss={dismiss} />

          {/* ------------------------------------------------- persona card */}
          <AnimatePresence>
            {focused && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="panel panel-bright absolute bottom-28 left-1/2 z-40 w-96 -translate-x-1/2 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-ink">{focused.name}</p>
                    <p className="label mt-0.5">
                      {focused.title} · {focused.city}
                    </p>
                  </div>
                  <button onClick={() => setFocus(null)} className="num text-xs text-faint hover:text-ink">
                    ✕
                  </button>
                </div>

                {(() => {
                  const r = reactions.get(focused.id);
                  if (!r) return <p className="mt-3 text-xs text-muted">Has not responded yet.</p>;
                  const picked = problems.find((p) => p.id === r.problemId);
                  return (
                    <>
                      <div className="mt-3 flex gap-3 num text-[10px] text-muted">
                        <span>attention {r.attention}</span>
                        <span>sentiment {r.sentiment.toFixed(2)}</span>
                        <span>{r.wouldPay ? "would pay" : "would not pay"}</span>
                      </div>
                      {r.reason && (
                        <p className="mt-2 text-xs leading-relaxed text-ink/85">&ldquo;{r.reason}&rdquo;</p>
                      )}
                      <p className="mt-3 label">Problem they actually have</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink/80">
                        {picked ? picked.statement : "None of these."}
                      </p>
                    </>
                  );
                })()}

                <p className="mt-3 label">Selected because</p>
                <p className="num mt-1 text-[10px] text-muted">{focused.why.join(" · ") || "—"}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ---------------------------------------------------- controls */}
          <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
            <div className="panel flex items-center gap-2 p-1.5">
              <button
                onClick={run}
                disabled={running}
                className="bg-accent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110 disabled:bg-edge disabled:text-faint"
              >
                {running ? PHASE_LABEL[phase] : verdict ? "Run again" : "Ask the market"}
              </button>

              {personas.length > 0 && (
                <button
                  onClick={() => setOnlyEngaged((v) => !v)}
                  className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                    onlyEngaged ? "text-accent" : "text-muted hover:text-ink"
                  }`}
                >
                  {onlyEngaged ? "Engaged only" : "All"}
                </button>
              )}

              {ventureFile?.chosenProblem && (
                <a
                  href="/committee"
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
                >
                  Committee →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- sidebar */}
        <aside className="flex w-80 flex-col border-l border-edge bg-surface/40">
          <div className="border-b border-edge p-4">
            <p className="label">The crowd</p>
            {verdict ? (
              <>
                <div className="mt-3 space-y-1.5">
                  <AttentionBar label="Full attention" n={verdict.attention.full} total={personas.length} tone="accent" />
                  <AttentionBar label="Partial" n={verdict.attention.partial} total={personas.length} tone="muted" />
                  <AttentionBar label="Ignored it" n={verdict.attention.ignore} total={personas.length} tone="cold" />
                </div>
                <div className="mt-3 flex justify-between num text-[10px] text-muted">
                  <span>mean sentiment {verdict.meanSentiment.toFixed(2)}</span>
                  <span>spread {verdict.sentimentSpread.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-faint">
                {personas.length > 0
                  ? `${personas.length} people selected, ${progress.done} have answered.`
                  : "Nobody asked yet."}
              </p>
            )}
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-4">
            <p className="label">What they said</p>
            <div className="mt-3 space-y-2">
              {[...reactions.values()]
                .filter((r) => r.reason)
                .slice(-40)
                .reverse()
                .map((r) => {
                  const p = personas.find((x) => x.id === r.personaId);
                  return (
                    <button
                      key={r.personaId}
                      onClick={() => setFocus(r.personaId)}
                      className="block w-full border-l-2 pl-3 text-left transition hover:border-accent"
                      style={{
                        borderColor:
                          r.attention === "full"
                            ? "var(--accent)"
                            : r.attention === "partial"
                              ? "var(--border-bright)"
                              : "var(--border)",
                      }}
                    >
                      <p className="label">
                        {p?.title ?? "persona"} · {p?.city ?? ""} · {r.problemId ?? "no match"}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink/75">{r.reason}</p>
                    </button>
                  );
                })}
              {reactions.size === 0 && (
                <p className="text-xs text-faint">
                  Reactions appear here as the crowd responds.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------- THE REVEAL */}
      <AnimatePresence>
        {showReveal && marketProblem && pitchedProblem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-ground/85 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="panel glow-accent mx-6 max-w-2xl p-8"
            >
              <p className="label text-accent">The market disagrees with you</p>

              <div className="mt-5">
                <p className="label">You pitched</p>
                <p className="mt-1 text-sm leading-relaxed text-muted line-through decoration-negative/60">
                  {pitchedProblem.statement}
                </p>
              </div>

              <div className="mt-5">
                <p className="label text-accent">The problem they actually have</p>
                <p className="mt-1 text-xl leading-snug text-ink">{marketProblem.statement}</p>
                <p className="mt-2 text-xs text-muted">
                  Felt by {marketProblem.whoHasIt}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-edge pt-4">
                {verdict?.problemVotes.slice(0, 3).map((v) => (
                  <div key={v.problemId}>
                    <p className="label">{v.problemId}</p>
                    <p className="num mt-0.5 text-lg text-ink">{v.votes}</p>
                    <p className="num text-[10px] text-muted">
                      sev {v.meanSeverity.toFixed(0)} · {(v.payRate * 100).toFixed(0)}% pay
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex gap-3">
                <button
                  onClick={acceptMarketProblem}
                  className="bg-accent px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
                >
                  Take this to the committee
                </button>
                <button
                  onClick={() => setShowReveal(false)}
                  className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
                >
                  Keep my framing
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function AttentionBar({
  label,
  n,
  total,
  tone,
}: {
  label: string;
  n: number;
  total: number;
  tone: "accent" | "muted" | "cold";
}) {
  const pct = total ? (n / total) * 100 : 0;
  const color =
    tone === "accent" ? "var(--accent)" : tone === "cold" ? "var(--cold)" : "var(--muted)";

  return (
    <div>
      <div className="flex justify-between num text-[10px] text-muted">
        <span>{label}</span>
        <span>{n}</span>
      </div>
      <div className="mt-1 h-1.5 bg-edge">
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function personaName(personas: DeployedPersona[], id: number) {
  return personas.find((p) => p.id === id)?.title ?? `persona ${id}`;
}
