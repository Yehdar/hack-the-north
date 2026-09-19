"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, type GlobeArc, type GlobeDot } from "@/components/globe/Globe";
import { Narrator } from "@/components/Narrator";
import { Hint } from "@/components/Hint";
import { DeliberationGraph } from "@/components/DeliberationGraph";
import { AgentBoot, MARKET_STEPS } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { Intake } from "@/components/Intake";
import { SystemPanel } from "@/components/hud/SystemPanel";
import { PersonaCall } from "@/components/PersonaCall";
import { StageRail, deriveStages } from "@/components/StageRail";
import { Reveal } from "@/components/Reveal";
import { Finding } from "@/components/Finding";
import { Door, DOOR_MS, armDoor } from "@/components/Door";
import { useVenture } from "@/lib/store";
import { diffSessions, summariseCrowd, useSessions, type SessionDelta } from "@/lib/sessions";
import { streamPost } from "@/lib/sse";
import { hubById } from "@/data/globePoints";
import { FIRMS } from "@/data/firms";
import type { AgentVerdict, PVSBreakdown, ProblemStatement } from "@/lib/types";
import type { CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";

// ============================================================================
// PART 1 — DISCOVERY.
//
// Seven beats, each with something moving:
//   intake -> split -> deploy -> react -> REVEAL -> council -> hand to Part 2
//
// The reveal is the one that matters. Every other beat exists to earn it —
// and the refine loop exists to cash it: rewrite the pitch around the market's
// problem, ask the same people again, and see what moved.
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

/** Re-running the rewrite against the same people and problems as run one. */
type RunOptions = {
  problems?: ProblemStatement[];
  personaIds?: number[];
  parentId?: string;
};

type RefineDraft = {
  draft: string;
  target: ProblemStatement;
  parentId: string;
  problems: ProblemStatement[];
  personaIds: number[];
  /** The framing run one pitched, carried to the closing card. */
  walkedInWith: string | null;
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Idle",
  problems: "Splitting the solution",
  deploy: "Deploying the crowd",
  react: "Listening",
  done: "The market has spoken",
};

// The boot plays once per page load. Coming back from Part 2 is not a cold start.
let booted = false;

const hubName = (id: string) => hubById(id)?.label ?? id;

// Where the idea is sent out from when the crowd deploys. Hack the North.
const HOME = hubById("waterloo") ?? { lat: 43.46, lon: -80.52 };
const TOTAL_STEPS = 8;

type NextStep = "ask" | "busy" | "council-busy" | "convene" | "committee" | "rerun";

export default function Discover() {
  const router = useRouter();
  const [booting, setBooting] = useState(() => !booted);

  const ventureFile = useVenture((v) => v.ventureFile);
  const replaceVenture = useVenture((v) => v.replace);
  const resetVenture = useVenture((v) => v.reset);
  const firmId = useVenture((v) => v.firmId);

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
  const asideRef = useRef<HTMLElement>(null);

  // ---- the refine loop
  const [refine, setRefine] = useState<RefineDraft | null>(null);
  const [refining, setRefining] = useState(false);
  const [delta, setDelta] = useState<SessionDelta[] | null>(null);
  const [walkedInWith, setWalkedInWith] = useState<string | null>(null);
  const isRerun = walkedInWith !== null;

  // ---- the way out of Part 1
  const [finding, setFinding] = useState(false);
  const [door, setDoor] = useState<"none" | "open" | "closed">("none");

  // The stream callback closes over state at the moment run() was created, so
  // reading `personas` inside it yields the empty array it was born with.
  // Deployment and reactions arrive in the same stream, so the ref is the only
  // way the feed can name who is speaking.
  const personasRef = useRef<DeployedPersona[]>([]);
  /** The saved run this screen is showing, so later beats land on it. */
  const sessionRef = useRef<string | null>(null);

  // ---- beat 6 and 7: the hub council and the score
  const [hubRanking, setHubRanking] = useState<HubRank[]>([]);
  const [councilHub, setCouncilHub] = useState<string | null>(null);
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilRoster, setCouncilRoster] = useState<{ id: string; role: string; weight: number }[]>([]);
  const [councilStances, setCouncilStances] = useState<Record<string, AgentVerdict>>({});
  const [councilLog, setCouncilLog] = useState<CouncilMsg[]>([]);
  const [pvs, setPvs] = useState<PVSBreakdown | null>(null);

  const intakeOpen = !booting && (!ventureFile || refine !== null);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  const run = useCallback((opts: RunOptions & { walkedInWith?: string | null } = {}) => {
    // Read the store directly: the intake writes the file and calls run() in
    // the same tick, before any re-render could hand this callback the new file.
    const vf = useVenture.getState().ventureFile;
    if (!vf) return;

    const sessionId = useSessions.getState().begin(vf.solution, opts.parentId);
    sessionRef.current = sessionId;
    let runProblems: ProblemStatement[] = opts.problems ?? [];

    setRunning(true);
    setPhase("problems");
    setProblems([]); setPersonas([]); setReactions(new Map());
    setFeed([]); setVerdict(null); setSignals(null); setShowReveal(false); setFocus(null);
    setProgress({ done: 0, total: 0 });
    personasRef.current = [];
    setHubRanking([]); setCouncilHub(null); setCouncilLog([]); setCouncilRoster([]);
    setCouncilStances({}); setPvs(null);
    setDelta(null);
    setWalkedInWith(opts.parentId ? (opts.walkedInWith ?? null) : null);

    const fail = () => {
      setRunning(false);
      setPhase("idle");
      useSessions.getState().remove(sessionId);
    };

    void streamPost(
      "/api/discovery/run",
      {
        solution: vf.solution,
        crowdSize: 120,
        problems: opts.problems,
        personaIds: opts.personaIds,
      },
      (ev) => {
        switch (ev.type) {
          case "start":
            setProvider(ev.provider as string);
            break;

          case "phase":
            setPhase(ev.phase as Phase);
            break;

          case "problems":
            runProblems = ev.problems as ProblemStatement[];
            setProblems(runProblems);
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
            const sig = ev.signals as CrowdSignals;
            const ranking = rankFromCrowd(v, personasRef.current);

            setVerdict(v);
            setSignals(sig);
            setHubRanking(ranking);
            setPhase("done");
            setRunning(false);

            const sessions = useSessions.getState();
            sessions.record(
              {
                ...summariseCrowd(v, sig, runProblems, personasRef.current.length),
                topHub: ranking[0]
                  ? { hubId: ranking[0].hubId, fitScore: ranking[0].fitScore }
                  : undefined,
              },
              sessionId
            );

            const saved = useSessions.getState().sessions;
            const mine = saved.find((s) => s.id === sessionId);
            const parent = opts.parentId ? saved.find((s) => s.id === opts.parentId) : undefined;
            setDelta(mine && parent ? diffSessions(parent, mine) : null);

            // A second run always gets the card back, aligned or not: what
            // moved is the point of having run it.
            if (v.mismatch || parent) setTimeout(() => setShowReveal(true), 600);
            break;
          }

          case "error":
            fail();
            break;
        }
      }
    ).catch(fail);
  }, []);

  /** Beat 6: convene the five-agent council on one city. Same engine as the
   *  investment committee, different roster. */
  const runCouncil = useCallback(
    (hubId: string) => {
      const problem = problems.find((p) => p.id === verdict?.marketProblemId);
      if (!problem || !verdict) return;

      const sessionId = sessionRef.current;
      const fit = hubRanking.find((h) => h.hubId === hubId)?.fitScore ?? 0;

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
            case "pvs": {
              const score = ev.pvs as PVSBreakdown;
              setPvs(score);
              if (sessionId) {
                useSessions.getState().record(
                  { pvs: score.total, pvsPassed: score.passed, topHub: { hubId, fitScore: fit } },
                  sessionId
                );
              }
              break;
            }
            case "done":
            case "error":
              setCouncilRunning(false);
              break;
          }
        }
      ).catch(() => setCouncilRunning(false));
    },
    [problems, verdict, hubRanking]
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
  }, [ventureFile, verdict, problems, replaceVenture, pvs, councilHub, hubRanking, councilStances]);

  /** From the reveal: take the market's problem, and sit the council in the
   *  city where it lands best. */
  const acceptAndConvene = useCallback(() => {
    acceptMarketProblem();
    setShowReveal(false);
    const top = hubRanking[0]?.hubId;
    if (top) runCouncil(top);
  }, [acceptMarketProblem, hubRanking, runCouncil]);

  /** Rewrite the pitch around the market's problem, for the founder to edit. */
  const startRefine = useCallback(async () => {
    const vf = useVenture.getState().ventureFile;
    const market = problems.find((p) => p.id === verdict?.marketProblemId);
    if (!vf || !market || !sessionRef.current) return;

    setRefining(true);
    const draft = await fetch("/api/discovery/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solution: vf.solution, problem: market }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { solution?: string } | null) => j?.solution)
      .catch(() => undefined);
    setRefining(false);
    setShowReveal(false);

    setRefine({
      draft: draft || vf.solution,
      target: market,
      parentId: sessionRef.current,
      // The adopted problem leads, so it is what the founder is now pitching.
      problems: [market, ...problems.filter((p) => p.id !== market.id)],
      personaIds: personasRef.current.map((p) => p.id),
      walkedInWith:
        walkedInWith ?? problems.find((p) => p.id === verdict?.pitchedProblemId)?.statement ?? null,
    });
  }, [problems, verdict, walkedInWith]);

  /** Part 1 closes the doors; Part 2 opens them. */
  const enterCommittee = useCallback(() => {
    acceptMarketProblem();
    setFinding(false);
    setDoor("open");
    setTimeout(() => setDoor("closed"), 40);
    setTimeout(() => {
      armDoor();
      router.push("/committee");
    }, 40 + DOOR_MS + 200);
  }, [acceptMarketProblem, router]);

  // Newest stage sits at the top of the sidebar, so the next thing to do is
  // always on screen. Scroll up when a new one arrives.
  const stageKey = `${hubRanking.length > 0}|${councilHub}|${Boolean(pvs)}`;
  useEffect(() => {
    asideRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [stageKey]);

  useEffect(() => {
    if (finding) router.prefetch("/committee");
  }, [finding, router]);

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

  const stages = deriveStages({
    hasIdea: Boolean(ventureFile),
    problems: problems.length,
    deployed: personas.length,
    answered: reactions.size,
    total: personas.length,
    hasVerdict: Boolean(verdict),
    councilRunning,
    councilDone: Boolean(pvs) || councilLog.length > 0,
    hasPvs: Boolean(pvs),
    running,
  });

  const marketProblem = problems.find((p) => p.id === verdict?.marketProblemId);
  const pitchedProblem = problems.find((p) => p.id === verdict?.pitchedProblemId);
  const marketVote = verdict?.problemVotes.find((v) => v.problemId === verdict.marketProblemId);
  const focused = focus ? personas.find((p) => p.id === focus) : null;
  const councilPoint = councilHub ? hubById(councilHub) : undefined;
  const findingCity = councilHub ?? hubRanking[0]?.hubId ?? null;
  const firmName = FIRMS[firmId]?.name ?? "the firm";
  const topCity = hubRanking[0] ? hubName(hubRanking[0].hubId) : null;

  // The crowd being sent out: one arc from Hack the North to every city in
  // it, launched in sequence, cleared once everyone has answered.
  const arcs: GlobeArc[] = useMemo(() => {
    if (!running || personas.length === 0) return [];
    const hubs = [...new Set(personas.map((p) => p.hubId))];
    return hubs.flatMap((id, i) => {
      const to = hubById(id);
      return to && to.id !== "waterloo"
        ? [{ id: `deploy:${id}`, from: HOME, to, delay: i * 70 }]
        : [];
    });
  }, [running, personas]);

  const conceded = useMemo(
    () => new Set(councilLog.filter((m) => m.kind === "concession").map((m) => m.from)),
    [councilLog]
  );

  // ---- the guide: what is happening, and the one thing to do next -------
  const guide = ((): { step: number; title: string; line: string } => {
    if (!ventureFile) {
      return {
        step: 1,
        title: "The product",
        line: "Describe what you built. The market will tell you which problem it actually solves.",
      };
    }
    if (running) {
      if (phase === "problems") {
        return {
          step: 2,
          title: "Problem split",
          line: "Splitting your idea into the distinct problems it could solve. The first is how you framed it — watch what happens to it.",
        };
      }
      if (phase === "deploy") {
        return {
          step: 3,
          title: "Deploy",
          line: "Choosing who should hear it: people who work in the space and can sign for it. Click any dot to see why they were picked.",
        };
      }
      return {
        step: 4,
        title: "Listen",
        line: `Asking each person which problem they actually have — not whether they like it. ${progress.done} of ${progress.total || 120} have answered.`,
      };
    }
    if (!verdict) {
      return {
        step: 1,
        title: "Ready",
        line: "We will split your idea into the problems it could solve, then ask 120 people which one they actually have.",
      };
    }
    if (councilRunning && councilHub) {
      return {
        step: 6,
        title: `Hub council · ${hubName(councilHub)}`,
        line: "Five agents are arguing about whether this problem is worth solving here. The lines show who is challenging whom.",
      };
    }
    if (pvs) {
      return {
        step: 7,
        title: "Validation",
        line: pvs.passed
          ? `Validation ${pvs.total}/100 — it clears the bar. An investment committee is waiting to test it.`
          : `Validation ${pvs.total}/100 — below the bar of ${pvs.threshold}. You can pitch anyway; the committee will be told.`,
      };
    }
    if (!verdict.marketProblemId) {
      return {
        step: 5,
        title: "The reveal",
        line: "Nobody in this crowd has any of these problems. That is a finding — try describing it differently.",
      };
    }
    if (verdict.mismatch) {
      return {
        step: 5,
        title: "The reveal",
        line: `You pitched ${verdict.pitchedProblemId}. The market has ${verdict.marketProblemId} — and ${Math.round((marketVote?.payRate ?? 0) * 100)}% of them would pay to fix it.`,
      };
    }
    return {
      step: 5,
      title: isRerun ? "Run two · aligned" : "The reveal",
      line: "The market has the problem you pitched. Next: is it worth solving, and where?",
    };
  })();

  const next: NextStep | null = !ventureFile
    ? null
    : running
      ? "busy"
      : !verdict
        ? "ask"
        : councilRunning
          ? "council-busy"
          : pvs || !topCity
            ? "committee"
            : !marketProblem
              ? "rerun"
              : "convene";

  const nextLabel =
    next === "busy"
      ? PHASE_LABEL[phase]
      : next === "ask"
        ? "Ask the market"
        : next === "council-busy"
          ? "Council deliberating…"
          : next === "committee"
            ? "Take it to the committee →"
            : next === "rerun"
              ? "Run again"
              : `Convene the ${topCity} council`;

  const nextDisabled =
    next === "busy" || next === "council-busy" || (next === "committee" && !marketProblem);

  const takeNextStep = () => {
    if (next === "ask" || next === "rerun") run();
    else if (next === "committee") setFinding(true);
    else if (next === "convene") acceptAndConvene();
  };

  return (
    <main className="relative h-screen overflow-hidden bg-ground text-ink">
      {booting && (
        <AgentBoot
          steps={MARKET_STEPS}
          tagline="see the problem"
          onComplete={() => {
            booted = true;
            setBooting(false);
          }}
        />
      )}
      <AnimatePresence>
        {intakeOpen && (
          <Intake
            key={refine ? "refine" : "new"}
            cta={refine ? "Ask them again" : "Ask the market"}
            refine={
              refine
                ? {
                    draft: refine.draft,
                    target: refine.target,
                    crowd: refine.personaIds.length,
                    problems: refine.problems.length,
                  }
                : undefined
            }
            onCancel={
              refine
                ? () => {
                    setRefine(null);
                    setShowReveal(true);
                  }
                : undefined
            }
            onDone={() => {
              const r = refine;
              setRefine(null);
              run(
                r
                  ? {
                      problems: r.problems,
                      personaIds: r.personaIds,
                      parentId: r.parentId,
                      walkedInWith: r.walkedInWith,
                    }
                  : {}
              );
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex h-full">
        <StageRail
          state={stages}
          onJump={(id) => {
            if (id === "reveal" && marketProblem && pitchedProblem) setShowReveal(true);
            if (id === "pitch" && marketProblem) setFinding(true);
          }}
        />

        <div className="relative flex-1">
          <Globe
            dots={dots}
            onDotClick={(id) => setFocus(Number(id.slice(1)))}
            // Face Hack the North while the idea is split and sent out, so the
            // arcs fan out towards the audience; then the council's city.
            focus={
              councilPoint
                ? { lat: councilPoint.lat, lon: councilPoint.lon }
                : running && phase !== "react"
                  ? { lat: HOME.lat, lon: HOME.lon }
                  : null
            }
            beacon={councilPoint ? { lat: councilPoint.lat, lon: councilPoint.lon } : null}
            arcs={arcs}
            className="h-full w-full"
          />

          {/* ---------------------------------------------------- narrator */}
          {/* Sits on the action it explains: what is happening, then the button. */}
          {!intakeOpen && !focused && (
            <div className="absolute bottom-[76px] left-1/2 z-30 w-[520px] max-w-[calc(100%-48px)] -translate-x-1/2">
              <Narrator step={guide.step} total={TOTAL_STEPS} title={guide.title} line={guide.line} />
            </div>
          )}

          {/* ---------------------------------------------------- top left */}
          <div className="absolute left-6 top-6 z-40 w-[300px]">
            <AnimatePresence mode="wait">
              {running ? (
                <ProcessingPanel
                  key="proc"
                  step={PHASE_LABEL[phase]}
                  done={progress.done}
                  total={progress.total || 120}
                  unit="People answered"
                  round={provider ? `provider ${provider}` : undefined}
                />
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  {ventureFile ? (
                    <>
                      {isRerun && (
                        <p className="label" style={{ color: "var(--accent)" }}>
                          Run two · rewritten
                        </p>
                      )}
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        &ldquo;{ventureFile.solution}&rdquo;
                      </p>
                      <button
                        onClick={() => resetVenture()}
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
          {/* One button, always the next step — its label says what happens. */}
          <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
            <div className="panel flex items-center gap-1 whitespace-nowrap p-1.5">
              {next && (
                <button
                  onClick={takeNextStep}
                  disabled={nextDisabled}
                  className={`bg-accent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110 disabled:bg-edge disabled:text-faint ${
                    nextDisabled ? "" : "beam"
                  }`}
                >
                  {nextLabel}
                </button>
              )}

              {verdict?.mismatch && !running && !councilHub && (
                <button
                  onClick={() => void startRefine()}
                  disabled={refining}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink disabled:opacity-50"
                >
                  {refining ? "Rewriting…" : "Rewrite · ask again"}
                </button>
              )}

              {verdict && !running && next !== "rerun" && (
                <button
                  onClick={() => run()}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                >
                  Run again
                </button>
              )}

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
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- sidebar */}
        {/* Newest stage first: the conclusion, then the evidence under it. */}
        <aside
          ref={asideRef}
          className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-edge bg-surface/40"
        >
          {/* ---- beat 7: the score ---- */}
          {pvs && (
            <div className={`border-b border-edge p-4 ${pvs.passed ? "" : "glow-accent"}`}>
              <div className="flex items-baseline justify-between">
                <p className="label">
                  Problem validation
                  <Hint>
                    How real and how big the problem is, out of 100: how badly the crowd feels
                    it and would pay, how much room is left, how the council rated this city,
                    and how much of that is cited rather than asserted. Below 60 you can still
                    pitch — the committee is told.
                  </Hint>
                </p>
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
              <button
                onClick={() => setFinding(true)}
                className="mt-3 block w-full bg-accent px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
              >
                Take it to the committee
              </button>
            </div>
          )}

          {/* ---- the council room ---- */}
          {councilRoster.length > 0 && councilHub && (
            <div className="border-b border-edge p-4">
              <div className="flex items-baseline justify-between">
                <p className="label">
                  The council · {hubName(councilHub)}
                  <Hint>
                    The same five-round protocol the investment committee uses: a blind first
                    pass, directed challenges, rebuttals that can change a mind, then a
                    Contrarian attacks wherever the room settled. Circle size is voting weight;
                    colour is stance.
                  </Hint>
                </p>
                {councilRunning && (
                  <span className="num animate-pulse text-[10px] text-accent">deliberating</span>
                )}
              </div>
              <div className="mt-2">
                <DeliberationGraph
                  seats={councilRoster}
                  stances={councilStances}
                  messages={councilLog}
                  conceded={conceded}
                />
              </div>
            </div>
          )}

          {/* ---- beat 6: pick a city, convene the council ---- */}
          {hubRanking.length > 0 && (
            <div className="border-b border-edge p-4">
              <p className="label">
                Where it lands
                <Hint>
                  Each city&apos;s fit for the market&apos;s problem, from the crowd alone: how
                  many people there have it, how many would pay, and how badly it hurts. Pick
                  one and five agents argue about it.
                </Hint>
              </p>
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
                        {hubName(h.hubId)}
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

          <div className="border-b border-edge p-4">
            <p className="label">
              The crowd
              <Hint>
                Attention is whether they cared at all; sentiment is how warmly. A spread near
                zero would mean the crowd collapsed into one voice — which is a bug, not a
                consensus.
              </Hint>
            </p>
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
              <p className="label">
                Who responded
                <Hint>
                  Which attributes separate the people who paid full attention from everyone
                  else. If your fans cannot sign a cheque, it shows up here first.
                </Hint>
              </p>

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

          <div className="p-4">
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
        {showReveal && marketProblem && pitchedProblem && verdict && (
          <Reveal
            pitched={pitchedProblem}
            market={marketProblem}
            aligned={!verdict.mismatch}
            votes={verdict.problemVotes}
            delta={delta}
            crowd={personas.length}
            problemCount={problems.length}
            city={hubRanking[0] ? hubName(hubRanking[0].hubId) : null}
            refining={refining}
            onAccept={acceptAndConvene}
            onRefine={() => void startRefine()}
            onClose={() => setShowReveal(false)}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------ PART ONE CLOSES HERE */}
      <AnimatePresence>
        {finding && marketProblem && verdict && (
          <Finding
            pitched={pitchedProblem}
            walkedInWith={walkedInWith}
            chosen={marketProblem}
            crowd={{
              asked: personas.length,
              engaged: verdict.attention.full,
              haveIt: marketVote?.votes ?? 0,
              payRate: marketVote?.payRate ?? 0,
            }}
            city={
              findingCity
                ? {
                    name: hubName(findingCity),
                    fitScore: hubRanking.find((h) => h.hubId === findingCity)?.fitScore ?? 0,
                  }
                : null
            }
            pvs={pvs}
            firmName={firmName}
            onEnter={enterCommittee}
            onStay={() => setFinding(false)}
          />
        )}
      </AnimatePresence>

      {door !== "none" && <Door state={door} title="The committee" subtitle={firmName} />}
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
