"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, type GlobeDot } from "@/components/globe/Globe";
import { AgentBoot } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { Intake } from "@/components/Intake";
import { SystemPanel } from "@/components/hud/SystemPanel";
import { PersonaCall } from "@/components/PersonaCall";
import { useVenture } from "@/lib/store";
import { streamPost } from "@/lib/sse";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import type { AgentVerdict, PVSBreakdown } from "@/lib/types";

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

type HubRank = {
  hubId: string;
  fitScore: number;
  asked: number;
  haveIt: number;
  wouldPay: number;
};

type CouncilMsg = {
  id: string;
  round: number;
  from: string;
  to: string;
  kind: FeedItem["kind"];
  text: string;
};

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
  const [signals, setSignals] = useState<CrowdSignals | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [onlyEngaged, setOnlyEngaged] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // The stream callback closes over state at the moment run() was created, so
  // reading `personas` inside it yields the empty array it was born with.
  // Deployment and reactions arrive in the same stream, so the ref is the only
  // way the feed can name who is speaking.
  const personasRef = useRef<DeployedPersona[]>([]);

  // ---- beat 6 and 7: the hub council and the score
  const [hubRanking, setHubRanking] = useState<HubRank[]>([]);
  const [councilHub, setCouncilHub] = useState<string | null>(null);
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilRoster, setCouncilRoster] = useState<{ id: string; role: string; weight: number }[]>([]);
  const [councilStances, setCouncilStances] = useState<Record<string, AgentVerdict>>({});
  const [councilLog, setCouncilLog] = useState<CouncilMsg[]>([]);
  const [pvs, setPvs] = useState<PVSBreakdown | null>(null);

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
    setFeed([]); setVerdict(null); setSignals(null); setShowReveal(false); setFocus(null);
    setProgress({ done: 0, total: 0 });
    personasRef.current = [];
    setHubRanking([]); setCouncilHub(null); setCouncilLog([]);
    setCouncilStances({}); setPvs(null);

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
            setSignals(ev.signals as CrowdSignals);
            setHubRanking(rankFromCrowd(v, personasRef.current));
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

  /** Beat 6: convene the five-agent council on one city. Same engine as the
   *  investment committee, different roster. */
  const runCouncil = useCallback(
    (hubId: string) => {
      const problem = problems.find((p) => p.id === verdict?.marketProblemId);
      if (!problem || !verdict) return;

      setCouncilHub(hubId);
      setCouncilRunning(true);
      setCouncilLog([]); setCouncilStances({}); setPvs(null);

      void streamPost(
        "/api/discovery/council",
        { hubId, problem, crowd: verdict },
        (ev) => {
          switch (ev.type) {
            case "start":
              setCouncilRoster(ev.roster as typeof councilRoster);
              setHubRanking(ev.hubRanking as HubRank[]);
              break;
            case "message": {
              const m = ev.message as CouncilMsg;
              setCouncilLog((l) => [...l, m]);
              setFeed((f) =>
                [{ id: m.id, agent: m.from, message: m.text, kind: m.kind }, ...f].slice(0, 5)
              );
              break;
            }
            case "verdict": {
              const v = ev.verdict as AgentVerdict;
              setCouncilStances((s) => ({ ...s, [v.agentId]: v }));
              break;
            }
            case "pvs":
              setPvs(ev.pvs as PVSBreakdown);
              break;
            case "done":
            case "error":
              setCouncilRunning(false);
              break;
          }
        }
      ).catch(() => setCouncilRunning(false));
    },
    [problems, verdict]
  );

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
      // Whatever Part 1 has established travels with it. The committee reads
      // exactly these fields, so the handoff needs no new contract.
      pvs: pvs ?? ventureFile.pvs,
      hubFindings: councilHub
        ? {
            ...ventureFile.hubFindings,
            [councilHub]: {
              hubId: councilHub,
              fitScore: hubRanking.find((h) => h.hubId === councilHub)?.fitScore ?? 0,
              verdicts: Object.values(councilStances),
              gapSummary:
                Object.values(councilStances)
                  .map((v) => v.position)
                  .join(" ") || "",
              incumbents: [],
              unserved: "",
            },
          }
        : ventureFile.hubFindings,
    });
    setShowReveal(false);
  }, [ventureFile, verdict, problems, replaceVenture, pvs, councilHub, hubRanking, councilStances]);

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
          <SystemPanel />

          {/* --------------------------------------------- call one person */}
          <AnimatePresence>
            {focused && ventureFile && (
              <PersonaCall
                key={focused.id}
                persona={focused}
                reaction={reactions.get(focused.id)}
                solution={ventureFile.solution}
                problems={problems}
                onClose={() => setFocus(null)}
              />
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

          {/* ---- who responded, and the one warning worth interrupting for ---- */}
          {signals && (
            <div className="border-b border-edge p-4">
              <p className="label">Who responded</p>

              {signals.warning && (
                <p className="glow-accent mt-2 p-2.5 text-[11px] leading-relaxed text-ink/90">
                  {signals.warning}
                </p>
              )}

              <div className="mt-3 space-y-1.5">
                {signals.signals.slice(0, 4).map((sig) => (
                  <div key={sig.attribute}>
                    <div className="flex justify-between num text-[10px]">
                      <span className="text-muted">{sig.attribute}</span>
                      <span className={sig.delta > 0 ? "text-accent" : "text-cold"}>
                        {sig.engagedMean} vs {sig.ignoredMean}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{sig.reading}</p>
                  </div>
                ))}
                {signals.signals.length === 0 && (
                  <p className="text-[10px] text-faint">
                    No attribute separates the people who engaged from the people who did not.
                    That is itself a finding: the response is not concentrated in a segment.
                  </p>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <p className="label text-positive">Strongest yes</p>
                  {signals.positives.map((q) => (
                    <p key={q.name} className="mt-1 text-[10px] leading-relaxed text-ink/70">
                      <span className="text-muted">{q.name}, {q.title}:</span> &ldquo;{q.quote}&rdquo;
                    </p>
                  ))}
                </div>
                <div>
                  <p className="label text-negative">Strongest no</p>
                  {signals.negatives.map((q) => (
                    <p key={q.name} className="mt-1 text-[10px] leading-relaxed text-ink/70">
                      <span className="text-muted">{q.name}, {q.title}:</span> &ldquo;{q.quote}&rdquo;
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- beat 6: pick a city, convene the council ---- */}
          {hubRanking.length > 0 && (
            <div className="border-b border-edge p-4">
              <p className="label">Where it lands</p>
              <div className="mt-3 space-y-1">
                {hubRanking.slice(0, 6).map((h) => (
                  <button
                    key={h.hubId}
                    onClick={() => runCouncil(h.hubId)}
                    disabled={councilRunning}
                    className={`w-full p-2 text-left transition disabled:opacity-40 ${
                      councilHub === h.hubId ? "glow-accent" : "panel hover:panel-bright"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-wider text-ink/90">
                        {h.hubId}
                      </span>
                      <span className="num text-[10px] text-muted">{h.fitScore}</span>
                    </div>
                    <div className="mt-1 h-1 bg-edge">
                      <div
                        className="h-full transition-all duration-500"
                        style={{
                          width: `${h.fitScore}%`,
                          background: councilHub === h.hubId ? "var(--accent)" : "var(--border-bright)",
                        }}
                      />
                    </div>
                    <p className="num mt-1 text-[9px] text-faint">
                      {h.haveIt}/{h.asked} have it · {h.wouldPay} would pay
                    </p>
                  </button>
                ))}
              </div>
              {!councilHub && (
                <p className="mt-2 text-[10px] leading-relaxed text-faint">
                  Pick a city and five agents will argue about whether the problem is
                  worth solving there.
                </p>
              )}
            </div>
          )}

          {/* ---- the council room ---- */}
          {councilRoster.length > 0 && (
            <div className="border-b border-edge p-4">
              <div className="flex items-baseline justify-between">
                <p className="label">The council · {councilHub}</p>
                {councilRunning && (
                  <span className="num animate-pulse text-[10px] text-accent">deliberating</span>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                {councilRoster.map((a) => {
                  const v = councilStances[a.id];
                  return (
                    <div key={a.id}>
                      <div className="flex justify-between num text-[10px]">
                        <span className="text-muted">{a.role}</span>
                        <span className="text-faint">
                          {v ? v.stance.toFixed(2) : "—"}
                        </span>
                      </div>
                      <div className="relative mt-1 h-1 bg-edge">
                        <div className="absolute left-1/2 top-0 h-full w-px bg-edge-bright" />
                        {v && (
                          <div
                            className="absolute top-0 h-full"
                            style={{
                              width: `${Math.abs(v.stance) * 50}%`,
                              left: v.stance >= 0 ? "50%" : `${50 - Math.abs(v.stance) * 50}%`,
                              background: v.stance >= 0 ? "var(--positive)" : "var(--negative)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---- beat 7: the score ---- */}
          {pvs && (
            <div className={`border-b border-edge p-4 ${pvs.passed ? "" : "glow-accent"}`}>
              <div className="flex items-baseline justify-between">
                <p className="label">Problem validation</p>
                <span className="num text-2xl text-ink">{pvs.total}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                <AttentionBar label="Severity" n={pvs.problemSeverity} total={100} tone="accent" />
                <AttentionBar label="Market gap" n={pvs.marketGap} total={100} tone="muted" />
                <AttentionBar label="Hub fit" n={pvs.hubFit} total={100} tone="muted" />
                <AttentionBar label="Evidence" n={pvs.evidenceStrength} total={100} tone="cold" />
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted">
                {pvs.passed
                  ? `Clears the bar of ${pvs.threshold}. The committee will still find the weak component.`
                  : `Below the bar of ${pvs.threshold}. You can pitch anyway — the committee will be told you did.`}
              </p>
              <a
                href="/committee"
                onClick={acceptMarketProblem}
                className="mt-3 block bg-accent px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
              >
                Take it to the committee
              </a>
            </div>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto p-4">
            {councilLog.length > 0 && (
              <>
                <p className="label">Council transcript</p>
                <div className="mt-3 mb-5 space-y-2">
                  {councilLog.map((m) => (
                    <div
                      key={m.id}
                      className="border-l-2 pl-3"
                      style={{
                        borderColor:
                          m.kind === "challenge"
                            ? "var(--accent)"
                            : m.kind === "concession"
                              ? "var(--positive)"
                              : "var(--border-bright)",
                      }}
                    >
                      <p className="label">
                        {m.from} {m.to === "room" ? "→ room" : `→ ${m.to}`} · {m.kind}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink/75">{m.text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

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
                        {p?.name ?? "persona"} · {p?.title ?? ""} · {r.problemId ?? "no match"}
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

/**
 * Hub ranking computed on the client from the reactions we already have — no
 * round trip, so the founder can pick a city the instant the crowd lands.
 * Same shape the council route returns, so the two agree.
 */
function rankFromCrowd(crowd: CrowdVerdict, personas: DeployedPersona[]): HubRank[] {
  const hubOf = new Map(personas.map((p) => [p.id, p.hubId]));
  const rows = new Map<string, { asked: number; haveIt: number; pay: number; severity: number }>();

  for (const r of crowd.reactions) {
    const hubId = hubOf.get(r.personaId);
    if (!hubId) continue;
    const row = rows.get(hubId) ?? { asked: 0, haveIt: 0, pay: 0, severity: 0 };
    row.asked++;
    if (r.problemId === crowd.marketProblemId) {
      row.haveIt++;
      row.severity += r.problemSeverity;
      if (r.wouldPay) row.pay++;
    }
    rows.set(hubId, row);
  }

  return [...rows.entries()]
    .map(([hubId, row]) => {
      const incidence = row.asked ? row.haveIt / row.asked : 0;
      const payRate = row.haveIt ? row.pay / row.haveIt : 0;
      const meanSeverity = row.haveIt ? row.severity / row.haveIt : 0;
      return {
        hubId,
        fitScore: Math.round(incidence * 55 + payRate * 30 + (meanSeverity / 100) * 15),
        asked: row.asked,
        haveIt: row.haveIt,
        wouldPay: row.pay,
      };
    })
    // A city where we asked almost nobody is not a finding.
    .filter((h) => h.asked >= 3)
    .sort((a, b) => b.fitScore - a.fitScore);
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
  const p = personas.find((x) => x.id === id);
  return p ? `${p.name} · ${p.title}` : `persona ${id}`;
}
