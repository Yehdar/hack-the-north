"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Globe,
  type GlobeArc,
  type GlobeDot,
  type GlobePlace,
} from "@/components/globe/Globe";
import { Narrator } from "@/components/Narrator";
import { Hint } from "@/components/Hint";
import { DeliberationGraph } from "@/components/DeliberationGraph";
import { AgentBoot, MARKET_STEPS } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { Intake } from "@/components/Intake";
import { SystemPanel } from "@/components/hud/SystemPanel";
import { Light, LightRow } from "@/components/Light";
import { PersonaCall } from "@/components/PersonaCall";
import { StageRail, deriveStages, type Segment } from "@/components/StageRail";
import { Reveal } from "@/components/Reveal";
import { Finding } from "@/components/Finding";
import { Door, DOOR_MS, armDoor } from "@/components/Door";
import { useVenture } from "@/lib/store";
import { diffSessions, summariseCrowd, useSessions, type SessionDelta } from "@/lib/sessions";
import { streamPost } from "@/lib/sse";
import { hubById } from "@/data/globePoints";
import { FIRMS } from "@/data/firms";
import type { AgentVerdict, PVSBreakdown, ProblemStatement } from "@/lib/types";
import type { Attention, CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";

// ============================================================================
// PART 1 — DISCOVERY, in segments.
//
//   split -> deploy -> listen -> the result -> council -> the score
//
// The server answers as fast as it can; the screen does not. Everything the
// stream sends is buffered, then played back one segment at a time at a pace a
// person can follow, and each segment ends by waiting for the founder with a
// button that names what comes next. One thing moves at a time.
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

type CouncilSeat = { id: string; role: string; weight: number };

type Batch = { done: number; total: number; batch: CrowdReaction[] };

/** Re-running the rewrite against the same people and problems as run one. */
type RunOptions = {
  problems?: ProblemStatement[];
  personaIds?: number[];
  parentId?: string;
  walkedInWith?: string | null;
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

type NextStep =
  | "run"
  | "splitting"
  | "choose"
  | "choosing"
  | "ask"
  | "listening"
  | "show"
  | "convene"
  | "rerun"
  | "council-busy"
  | "score"
  | "committee";

/** Segments that play by themselves; the rest wait for the founder. */
const PLAYING: Segment[] = ["split", "deploy", "listen", "council"];

// Pacing, in ms. Slow enough to read, quick enough not to drag.
const PACE = {
  problem: 700, // between candidate problems appearing
  deploy: 1800, // let the arcs land before offering the next step
  batch: 1300, // between groups of answers
  round: 1400, // the narrator explains a council round before it starts
};

/** Roughly how long a line takes to read, clamped so the room never stalls. */
function readingTime(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.min(3600, Math.max(1600, 700 + words * 75));
}

const COUNCIL_ROUND: Record<number, { title: string; line: string }> = {
  1: {
    title: "Round 1 · on their own",
    line: "Each agent answers only the question its lane owns, blind — nobody can anchor on anybody.",
  },
  2: {
    title: "Round 2 · cross-examination",
    line: "Now they read each other and challenge specific claims, by name. Challenges draw as coral lines.",
  },
  3: {
    title: "Round 3 · rebuttal",
    line: "Challenged agents answer — and may change their minds. A green line is a concession.",
  },
  4: {
    title: "Round 4 · the Contrarian",
    line: "The Contrarian attacks wherever the room has settled.",
  },
};

// The boot plays once per page load. Coming back from Part 2 is not a cold start.
let booted = false;

const hubName = (id: string) => hubById(id)?.label ?? id;

// Where the idea is sent out from when the crowd deploys. Hack the North.
const HOME = hubById("waterloo") ?? { lat: 43.46, lon: -80.52 };
const TOTAL_STEPS = 8;

export default function Discover() {
  const router = useRouter();
  const [booting, setBooting] = useState(() => !booted);

  const ventureFile = useVenture((v) => v.ventureFile);
  const replaceVenture = useVenture((v) => v.replace);
  const resetVenture = useVenture((v) => v.reset);
  const firmId = useVenture((v) => v.firmId);

  // ---- what is on screen
  const [segment, setSegment] = useState<Segment>("idle");
  const [provider, setProvider] = useState("");
  const [expecting, setExpecting] = useState(0);
  const [deployReady, setDeployReady] = useState(false);
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
  /** Click a light to see only those people. Null shows everyone. */
  const [stanceFilter, setStanceFilter] = useState<Attention | null>(null);
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

  // ---- the hub council and the score
  const [hubRanking, setHubRanking] = useState<HubRank[]>([]);
  const [councilHub, setCouncilHub] = useState<string | null>(null);
  const [councilRoster, setCouncilRoster] = useState<CouncilSeat[]>([]);
  const [councilStances, setCouncilStances] = useState<Record<string, AgentVerdict>>({});
  const [councilLog, setCouncilLog] = useState<CouncilMsg[]>([]);
  const [councilRound, setCouncilRound] = useState(0);
  const [pvs, setPvs] = useState<PVSBreakdown | null>(null);

  // ---- what has arrived but not been shown yet. Refs, not state: the stream
  // writes here as fast as it likes, and nothing re-renders until playback
  // decides it is time.
  const bufProblems = useRef<ProblemStatement[]>([]);
  const bufPersonas = useRef<DeployedPersona[]>([]);
  const bufBatches = useRef<Batch[]>([]);
  const bufVerdict = useRef<CrowdVerdict | null>(null);
  const bufSignals = useRef<CrowdSignals | null>(null);
  const councilQueue = useRef<Record<string, unknown>[]>([]);
  const pendingPvs = useRef<PVSBreakdown | null>(null);

  const problemsShown = useRef(0);
  const batchesShown = useRef(0);
  const councilShown = useRef(0);
  const lastRound = useRef(0);
  const roundAnnounced = useRef(false);
  const nextAt = useRef(0);
  /** Skip: finish the current segment quickly. */
  const skipping = useRef(false);
  /** A rewrite run already knows its problems and crowd, so it walks itself
   *  through those segments and slows down for the answers. */
  const auto = useRef(false);
  /** Each run owns the screen; a stale stream from an earlier run is ignored. */
  const runToken = useRef(0);
  const councilToken = useRef(0);

  const personasRef = useRef<DeployedPersona[]>([]);
  /** The saved run this screen is showing, so later beats land on it. */
  const sessionRef = useRef<string | null>(null);
  const parentRef = useRef<string | null>(null);

  const intakeOpen = !booting && (!ventureFile || refine !== null);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  // ---------------------------------------------------------------- the run
  const run = useCallback((opts: RunOptions = {}) => {
    // Read the store directly: the intake writes the file and calls run() in
    // the same tick, before any re-render could hand this callback the new file.
    const vf = useVenture.getState().ventureFile;
    if (!vf) return;

    const token = ++runToken.current;
    const sessionId = useSessions.getState().begin(vf.solution, opts.parentId);
    sessionRef.current = sessionId;
    parentRef.current = opts.parentId ?? null;
    auto.current = Boolean(opts.parentId);
    skipping.current = false;
    nextAt.current = 0;

    bufProblems.current = [];
    bufPersonas.current = [];
    bufBatches.current = [];
    bufVerdict.current = null;
    bufSignals.current = null;
    problemsShown.current = 0;
    batchesShown.current = 0;
    personasRef.current = [];

    setSegment("split");
    setExpecting(0);
    setDeployReady(false);
    setProblems([]); setPersonas([]); setReactions(new Map());
    setFeed([]); setVerdict(null); setSignals(null); setShowReveal(false); setFocus(null);
    setProgress({ done: 0, total: 0 });
    setHubRanking([]); setCouncilHub(null); setCouncilLog([]); setCouncilRoster([]);
    setCouncilStances({}); setCouncilRound(0); setPvs(null);
    setDelta(null);
    setWalkedInWith(opts.parentId ? (opts.walkedInWith ?? null) : null);

    const fail = () => {
      if (token !== runToken.current) return;
      setSegment("idle");
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
        if (token !== runToken.current) return;
        switch (ev.type) {
          case "start":
            setProvider(ev.provider as string);
            break;
          case "problems":
            bufProblems.current = ev.problems as ProblemStatement[];
            setExpecting(bufProblems.current.length);
            break;
          case "deploy":
            bufPersonas.current = ev.personas as DeployedPersona[];
            break;
          case "reactions":
            bufBatches.current.push({
              done: ev.done as number,
              total: ev.total as number,
              batch: ev.batch as CrowdReaction[],
            });
            break;
          case "verdict": {
            const v = ev.verdict as CrowdVerdict;
            const sig = ev.signals as CrowdSignals;
            bufVerdict.current = v;
            bufSignals.current = sig;

            // Saved the moment it exists, whether or not the founder ever
            // presses on to see it.
            const ranking = rankFromCrowd(v, bufPersonas.current);
            useSessions.getState().record(
              {
                ...summariseCrowd(v, sig, bufProblems.current, bufPersonas.current.length),
                topHub: ranking[0]
                  ? { hubId: ranking[0].hubId, fitScore: ranking[0].fitScore }
                  : undefined,
              },
              sessionId
            );
            break;
          }
          case "error":
            fail();
            break;
        }
      }
    ).catch(fail);
  }, []);

  // ---------------------------------------------------------------- playback
  // A 100ms loop moves one item at a time from what has arrived to what is on
  // screen, waiting between items. Polling rather than reacting to arrivals, so
  // a burst from the server can never reset the pacing.
  useEffect(() => {
    if (!PLAYING.includes(segment)) return;

    const showBatch = ({ done, total, batch }: Batch) => {
      setProgress({ done, total });
      setReactions((prev) => {
        const next = new Map(prev);
        for (const r of batch) next.set(r.personaId, r);
        return next;
      });
      // One voice at a time: the strongest thing anyone in this group said.
      const loudest = batch
        .filter((r) => r.reason && r.attention !== "ignore")
        .sort((a, b) => b.problemSeverity - a.problemSeverity)[0];
      setFeed(
        loudest
          ? [
              {
                id: `r${loudest.personaId}`,
                agent: personaName(personasRef.current, loudest.personaId),
                message: loudest.reason,
                kind: (loudest.sentiment > 0.6 ? "concession" : "challenge") as FeedItem["kind"],
              },
            ]
          : []
      );
    };

    const tick = () => {
      const now = performance.now();
      if (now < nextAt.current) return;
      const quick = skipping.current;

      if (segment === "split") {
        const all = bufProblems.current;
        if (problemsShown.current < all.length) {
          problemsShown.current += 1;
          setProblems(all.slice(0, problemsShown.current));
          nextAt.current = now + (quick || auto.current ? 150 : PACE.problem);
        } else if (all.length > 0 && auto.current) {
          nextAt.current = now + 400;
          setSegment("deploy");
        }
        return;
      }

      if (segment === "deploy") {
        if (personasRef.current.length === 0) {
          const crowd = bufPersonas.current;
          if (crowd.length === 0) return;
          personasRef.current = crowd;
          setPersonas(crowd);
          setProgress({ done: 0, total: crowd.length });
          nextAt.current = now + (quick || auto.current ? 500 : PACE.deploy);
        } else if (auto.current) {
          nextAt.current = now + 300;
          setSegment("listen");
        } else {
          setDeployReady(true);
        }
        return;
      }

      if (segment === "listen") {
        const batches = bufBatches.current;
        if (batchesShown.current < batches.length) {
          showBatch(batches[batchesShown.current]);
          batchesShown.current += 1;
          nextAt.current = now + (quick ? 90 : PACE.batch);
        } else if (bufVerdict.current) {
          skipping.current = false;
          setFeed([]);
          setSegment("heard");
        }
        return;
      }

      // ---- the council, one event at a time
      const queue = councilQueue.current;
      if (councilShown.current >= queue.length) return;
      const ev = queue[councilShown.current];

      const round =
        ev.type === "message"
          ? (ev.message as CouncilMsg).round
          : ev.type === "verdict"
            ? (ev.round as number)
            : null;

      // Before a new round starts, pause on it so the narrator can say what
      // the round is for.
      if (round !== null && round !== lastRound.current) {
        if (!roundAnnounced.current && !quick) {
          roundAnnounced.current = true;
          setCouncilRound(round);
          nextAt.current = now + PACE.round;
          return;
        }
        roundAnnounced.current = false;
        lastRound.current = round;
        setCouncilRound(round);
      }

      councilShown.current += 1;
      switch (ev.type) {
        case "start":
          setCouncilRoster(ev.roster as CouncilSeat[]);
          nextAt.current = now + (quick ? 60 : 600);
          break;
        case "message": {
          const m = ev.message as CouncilMsg;
          setCouncilLog((l) => [...l, m]);
          nextAt.current = now + (quick ? 90 : readingTime(m.text));
          break;
        }
        case "verdict": {
          const v = ev.verdict as AgentVerdict;
          setCouncilStances((s) => ({ ...s, [v.agentId]: v }));
          break;
        }
        case "pvs":
          pendingPvs.current = ev.pvs as PVSBreakdown;
          break;
        case "done":
          skipping.current = false;
          setSegment("deliberated");
          break;
        case "error":
          skipping.current = false;
          setSegment("result");
          break;
      }
    };

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [segment]);

  const skip = () => {
    skipping.current = true;
    nextAt.current = 0;
  };

  /** Everyone has answered: put the market's answer on screen. */
  const revealResult = useCallback(() => {
    const v = bufVerdict.current;
    if (!v) return;
    setVerdict(v);
    setSignals(bufSignals.current);
    setHubRanking(rankFromCrowd(v, personasRef.current));

    const saved = useSessions.getState().sessions;
    const mine = saved.find((s) => s.id === sessionRef.current);
    const parent = parentRef.current ? saved.find((s) => s.id === parentRef.current) : undefined;
    setDelta(mine && parent ? diffSessions(parent, mine) : null);

    setSegment("result");
    if (v.marketProblemId) setTimeout(() => setShowReveal(true), 200);
  }, []);

  /** Convene the five-agent council on one city. Same engine as the
   *  investment committee, different roster. */
  const runCouncil = useCallback(
    (hubId: string) => {
      const problem = problems.find((p) => p.id === verdict?.marketProblemId);
      if (!problem || !verdict) return;

      const token = ++councilToken.current;
      const sessionId = sessionRef.current;
      const fit = hubRanking.find((h) => h.hubId === hubId)?.fitScore ?? 0;

      councilQueue.current = [];
      councilShown.current = 0;
      lastRound.current = 0;
      roundAnnounced.current = false;
      pendingPvs.current = null;
      skipping.current = false;
      nextAt.current = 0;

      setCouncilHub(hubId);
      setCouncilLog([]); setCouncilStances({}); setCouncilRoster([]); setCouncilRound(0);
      setPvs(null);
      setShowReveal(false);
      setSegment("council");

      void streamPost("/api/discovery/council", { hubId, problem, crowd: verdict }, (ev) => {
        if (token !== councilToken.current) return;
        councilQueue.current.push(ev);
        if (ev.type === "pvs" && sessionId) {
          const score = ev.pvs as PVSBreakdown;
          useSessions.getState().record(
            { pvs: score.total, pvsPassed: score.passed, topHub: { hubId, fitScore: fit } },
            sessionId
          );
        }
      }).catch(() => {
        if (token === councilToken.current) councilQueue.current.push({ type: "error" });
      });
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

  /** From the result: take the market's problem, and sit the council in the
   *  city where it lands best. */
  const acceptAndConvene = useCallback(() => {
    acceptMarketProblem();
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

  // ---------------------------------------------------------------- derived
  const listening = segment === "listen";
  const answered = segment !== "idle" && !PLAYING.slice(0, 3).includes(segment);

  const visible = onlyEngaged
    ? personas.filter((p) => reactions.get(p.id)?.attention === "full")
    : personas;

  const dots: GlobeDot[] = visible.map((p) => {
    const r = reactions.get(p.id);
    return {
      id: `p${p.id}`,
      lat: p.lat,
      lon: p.lon,
      // Names live on the place layer, anchored at the city itself. Tagging one
      // arbitrary dot in a cluster prints the name over its own neighbours.
      label: "",
      stance: r ? r.sentiment * 2 - 1 : undefined,
      weight: r?.attention === "full" ? 0.8 : r?.attention === "partial" ? 0.45 : 0.2,
      active: listening && !r,
    };
  });

  // One marker per city that actually has someone in it, sized by how many, so
  // the collision layout keeps the crowded places and drops the sparse ones.
  const places: GlobePlace[] = (() => {
    const counts = new Map<string, number>();
    for (const p of visible) counts.set(p.hubId, (counts.get(p.hubId) ?? 0) + 1);

    return [...counts.entries()]
      .map(([hubId, n]): GlobePlace | null => {
        const hub = hubById(hubId);
        if (!hub) return null;
        return {
          id: hubId,
          name: hub.label,
          lat: hub.lat,
          lon: hub.lon,
          weight: n,
          active: councilHub === hubId,
        };
      })
      .filter((p): p is GlobePlace => p !== null);
  })();

  const stages = deriveStages(segment, Boolean(ventureFile));

  const marketProblem = problems.find((p) => p.id === verdict?.marketProblemId);
  const pitchedProblem = problems.find((p) => p.id === verdict?.pitchedProblemId);
  const marketVote = verdict?.problemVotes.find((v) => v.problemId === verdict.marketProblemId);
  const focused = focus ? personas.find((p) => p.id === focus) : null;
  const councilPoint = councilHub ? hubById(councilHub) : undefined;
  const findingCity = councilHub ?? hubRanking[0]?.hubId ?? null;
  const firmName = FIRMS[firmId]?.name ?? "the firm";
  const topCity = hubRanking[0] ? hubName(hubRanking[0].hubId) : null;
  const cities = new Set(personas.map((p) => p.hubId)).size;

  // Live attention while people are still answering.
  const live = { full: 0, partial: 0, ignore: 0 };
  for (const r of reactions.values()) live[r.attention]++;

  // The crowd being sent out: one arc from Hack the North to every city in
  // it, launched in sequence, cleared once everyone has answered.
  const arcsOn = segment === "deploy" || segment === "listen";
  const arcs: GlobeArc[] = useMemo(() => {
    if (!arcsOn || personas.length === 0) return [];
    const hubs = [...new Set(personas.map((p) => p.hubId))];
    return hubs.flatMap((id, i) => {
      const to = hubById(id);
      return to && to.id !== "waterloo"
        ? [{ id: `deploy:${id}`, from: HOME, to, delay: i * 90 }]
        : [];
    });
  }, [arcsOn, personas]);

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
    switch (segment) {
      case "split":
        return expecting > 0 && problems.length >= expecting
          ? {
              step: 2,
              title: "Problem split",
              line: `Your idea could be solving any of these ${expecting} problems. The first is how you framed it — keep an eye on it. Next, we choose who to ask.`,
            }
          : {
              step: 2,
              title: "Problem split",
              line: "First, we split your idea into the distinct problems it could be solving.",
            };
      case "deploy":
        return deployReady
          ? {
              step: 3,
              title: "Deploy",
              line: `${personas.length} people in ${cities} cities who work in this space — many of them can sign for it. Click any dot to see why they were picked.`,
            }
          : {
              step: 3,
              title: "Deploy",
              line: "Now we choose who should hear it, and send it out from here.",
            };
      case "listen":
        return {
          step: 4,
          title: "Listen",
          line: `Each person picks which problem they actually have — not whether they like the idea. ${progress.done} of ${progress.total || personas.length} have answered.`,
        };
      case "heard":
        return {
          step: 4,
          title: "Listen",
          line: "Everyone has answered. Ready to see which problem the market actually has?",
        };
      case "council":
        return councilRound && COUNCIL_ROUND[councilRound]
          ? {
              step: 6,
              title: `${hubName(councilHub ?? "")} council · ${COUNCIL_ROUND[councilRound].title}`,
              line: COUNCIL_ROUND[councilRound].line,
            }
          : {
              step: 6,
              title: `Hub council · ${hubName(councilHub ?? "")}`,
              line: "Five agents are about to argue about whether this problem is worth solving here. First, the chair hands each of them one question.",
            };
      case "deliberated":
        return {
          step: 6,
          title: "The council has spoken",
          line: "That is the argument. Next, what it adds up to: one validation score.",
        };
      case "scored":
        return pvs
          ? {
              step: 7,
              title: "Validation",
              line: pvs.passed
                ? `Validation ${pvs.total}/100 — it clears the bar. An investment committee is waiting to test it.`
                : `Validation ${pvs.total}/100 — below the bar of ${pvs.threshold}. You can pitch anyway; the committee will be told.`,
            }
          : { step: 7, title: "Validation", line: "" };
      case "result":
        if (!verdict?.marketProblemId) {
          return {
            step: 5,
            title: "The result",
            line: "Nobody in this crowd has any of these problems. That is a finding — try describing it differently.",
          };
        }
        return verdict.mismatch
          ? {
              step: 5,
              title: "The reveal",
              line: `You pitched ${verdict.pitchedProblemId}. The market has ${verdict.marketProblemId} — and ${Math.round((marketVote?.payRate ?? 0) * 100)}% of them would pay to fix it. Next: is it worth solving, and where?`,
            }
          : {
              step: 5,
              title: isRerun ? "Run two · aligned" : "The reveal",
              line: "The market has the problem you pitched. Next: is it worth solving, and where?",
            };
      default:
        return {
          step: 1,
          title: "Ready",
          line: "We will split your idea into the problems it could solve, then ask 120 people which one they actually have. One step at a time.",
        };
    }
  })();

  const next: NextStep | null = !ventureFile
    ? null
    : segment === "idle"
      ? "run"
      : segment === "split"
        ? expecting > 0 && problems.length >= expecting && !auto.current
          ? "choose"
          : "splitting"
        : segment === "deploy"
          ? deployReady
            ? "ask"
            : "choosing"
          : segment === "listen"
            ? "listening"
            : segment === "heard"
              ? "show"
              : segment === "result"
                ? marketProblem && topCity
                  ? "convene"
                  : "rerun"
                : segment === "council"
                  ? "council-busy"
                  : segment === "deliberated"
                    ? "score"
                    : "committee";

  const nextLabel: Record<NextStep, string> = {
    run: "Ask the market",
    splitting: "Splitting your idea…",
    choose: "Next: choose who to ask →",
    choosing: "Choosing who to ask…",
    ask: "Next: ask them →",
    listening: `Listening · ${progress.done}/${progress.total || personas.length || 120}`,
    show: "Show me what they said →",
    convene: `Convene the ${topCity} council`,
    rerun: "Run again",
    "council-busy": "Council in session…",
    score: "See the validation score →",
    committee: "Take it to the committee →",
  };

  const nextDisabled =
    next === "splitting" ||
    next === "choosing" ||
    next === "listening" ||
    next === "council-busy" ||
    (next === "committee" && !marketProblem);

  const takeNextStep = () => {
    switch (next) {
      case "run":
      case "rerun":
        run();
        break;
      case "choose":
        nextAt.current = 0;
        setSegment("deploy");
        break;
      case "ask":
        nextAt.current = 0;
        setSegment("listen");
        break;
      case "show":
        revealResult();
        break;
      case "convene":
        acceptAndConvene();
        break;
      case "score":
        setPvs(pendingPvs.current);
        setSegment("scored");
        break;
      case "committee":
        setFinding(true);
        break;
    }
  };

  const panel =
    segment === "split"
      ? { step: "Splitting your idea", unit: "Problems found", done: problems.length, total: expecting || 4 }
      : segment === "deploy"
        ? { step: "Choosing who to ask", unit: "People chosen", done: personas.length, total: personas.length || 120 }
        : segment === "listen"
          ? { step: "Listening", unit: "People answered", done: progress.done, total: progress.total || personas.length }
          : null;

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
            places={places}
            onDotClick={(id) => setFocus(Number(id.slice(1)))}
            // Face Hack the North while the idea is split and sent out, so the
            // arcs fan out towards the audience; then the council's city.
            focus={
              councilPoint
                ? { lat: councilPoint.lat, lon: councilPoint.lon }
                : segment === "split" || segment === "deploy"
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
              {panel ? (
                <ProcessingPanel
                  key="proc"
                  step={panel.step}
                  done={panel.done}
                  total={panel.total}
                  unit={panel.unit}
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

            {/* candidate problems, one at a time */}
            {problems.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="label">Candidate problems</p>
                <AnimatePresence initial={false}>
                  {problems.map((p, i) => {
                    const vote = verdict?.problemVotes.find((v) => v.problemId === p.id);
                    const isMarket = verdict?.marketProblemId === p.id;
                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className={`panel p-3 ${isMarket ? "glow-accent" : ""}`}
                      >
                        {/* A light, a plain label and a headcount. "p2 · 57 ·
                            86% pay" is a database row; this is a sentence. */}
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-medium text-ink">
                            {isMarket
                              ? "What they actually struggle with"
                              : i === 0
                                ? "What you said you solve"
                                : "Another possibility"}
                          </span>
                          {vote && (
                            <Light
                              signal={
                                vote.votes === 0
                                  ? "off"
                                  : vote.payRate >= 0.55
                                    ? "go"
                                    : vote.payRate >= 0.3
                                      ? "caution"
                                      : "stop"
                              }
                              label=""
                              size={9}
                            />
                          )}
                        </div>

                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink/90">
                          {p.statement}
                        </p>

                        {vote && (
                          <p className="mt-2 border-t border-edge pt-1.5 text-[10px] leading-relaxed text-muted">
                            <span className="text-ink">{vote.votes} people</span> have this
                            {vote.votes > 0 && (
                              <>
                                {" · "}
                                <span
                                  style={{
                                    color:
                                      vote.payRate >= 0.55
                                        ? "var(--go)"
                                        : vote.payRate >= 0.3
                                          ? "var(--caution)"
                                          : "var(--stop)",
                                  }}
                                >
                                  {(vote.payRate * 100).toFixed(0)}% would pay
                                </span>
                              </>
                            )}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* One voice at a time, and only while people are answering. */}
          {listening && <AgentFeed items={feed} onDismiss={dismiss} />}
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
                  {nextLabel[next]}
                </button>
              )}

              {PLAYING.includes(segment) && (
                <button
                  onClick={skip}
                  title="Finish this step now"
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                >
                  Skip ▸▸
                </button>
              )}

              {segment === "result" && verdict?.mismatch && !councilHub && (
                <button
                  onClick={() => void startRefine()}
                  disabled={refining}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink disabled:opacity-50"
                >
                  {refining ? "Rewriting…" : "Rewrite · ask again"}
                </button>
              )}

              {(segment === "result" || segment === "scored") && next !== "rerun" && (
                <button
                  onClick={() => run()}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                >
                  Run again
                </button>
              )}

              {personas.length > 0 && answered && (
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
          {/* ---- the score ---- */}
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
                {segment === "council" && (
                  <span className="num animate-pulse text-[10px] text-accent">in session</span>
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

          {/* ---- pick a city, convene the council ---- */}
          {hubRanking.length > 0 && (
            <div className="border-b border-edge p-4">
              <p className="label">
                Where it lands
                <Hint>
                  Each city&apos;s fit for the market&apos;s problem, from the crowd alone: how
                  many people there have this problem, how many would pay to fix it, and
                  how badly it hurts them. Pick
                  one and five agents argue about it.
                </Hint>
              </p>
              <div className="mt-3 space-y-1">
                {hubRanking.slice(0, 6).map((h) => (
                  <button
                    key={h.hubId}
                    onClick={() => runCouncil(h.hubId)}
                    disabled={segment === "council"}
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
                    {/* Spelled out. "2/4 have it · 1 would pay" reads as a
                        score line rather than a sentence about people. */}
                    <p className="mt-1 text-[9px] leading-relaxed text-faint">
                      {h.haveIt} of the {h.asked} we asked here have this problem
                      {h.haveIt > 0 && `, ${h.wouldPay} would pay to fix it`}
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
            {verdict || reactions.size > 0 ? (
              <>
                {/* Lights, not bars. A bar says how many; a light says whether
                    that is good news, which is the thing being asked. */}
                <div className="mt-2 divide-y divide-edge">
                  <LightRow
                    signal="go"
                    title="Supports"
                    count={verdict ? verdict.attention.full : live.full}
                    total={personas.length}
                    note="Has the problem and wants it solved"
                    onClick={() =>
                      setStanceFilter((f) => (f === "full" ? null : "full"))
                    }
                    selected={stanceFilter === null ? undefined : stanceFilter === "full"}
                  />
                  <LightRow
                    signal="caution"
                    title="Unsure"
                    count={verdict ? verdict.attention.partial : live.partial}
                    total={personas.length}
                    note="Sees it, not convinced enough to act"
                    onClick={() =>
                      setStanceFilter((f) => (f === "partial" ? null : "partial"))
                    }
                    selected={stanceFilter === null ? undefined : stanceFilter === "partial"}
                  />
                  <LightRow
                    signal="stop"
                    title="Rejected"
                    count={verdict ? verdict.attention.ignore : live.ignore}
                    total={personas.length}
                    note="Not a problem they think about"
                    onClick={() =>
                      setStanceFilter((f) => (f === "ignore" ? null : "ignore"))
                    }
                    selected={stanceFilter === null ? undefined : stanceFilter === "ignore"}
                  />
                </div>
                {verdict && (
                  <p className="mt-3 border-t border-edge pt-2 text-[10px] leading-relaxed text-muted">
                    {verdict.sentimentSpread < 0.12
                      ? "They all felt much the same way, which usually means the crowd was too alike."
                      : "Opinions were genuinely split, which is what a real market looks like."}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-faint">
                {personas.length > 0
                  ? `${personas.length} people chosen. Nobody has answered yet.`
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

            <div className="flex items-baseline justify-between gap-2">
              <p className="label">
                {stanceFilter === "full"
                  ? "Supports"
                  : stanceFilter === "partial"
                    ? "Unsure"
                    : stanceFilter === "ignore"
                      ? "Rejected"
                      : "What they said"}
              </p>
              {stanceFilter && (
                <button
                  onClick={() => setStanceFilter(null)}
                  className="label underline-offset-2 hover:text-ink hover:underline"
                >
                  show everyone
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {answered ? (
                [...reactions.values()]
                  .filter((r) => r.reason)
                  .filter((r) => !stanceFilter || r.attention === stanceFilter)
                  .slice(-40)
                  .reverse()
                  .map((r) => {
                    const p = personas.find((x) => x.id === r.personaId);
                    return (
                      <button
                        key={r.personaId}
                        onClick={() => setFocus(r.personaId)}
                        className="block w-full rounded-[3px] px-2 py-1.5 text-left transition hover:bg-surface-2"
                      >
                        {/* A light, then a name in sentence case. The old row
                            was three all-caps fragments and a schema code —
                            legible only if you already knew the schema. */}
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background:
                                r.attention === "full"
                                  ? "var(--go)"
                                  : r.attention === "partial"
                                    ? "var(--caution)"
                                    : "var(--stop)",
                              boxShadow: `0 0 7px -1px ${
                                r.attention === "full"
                                  ? "var(--go)"
                                  : r.attention === "partial"
                                    ? "var(--caution)"
                                    : "var(--stop)"
                              }`,
                            }}
                          />
                          <span className="truncate text-[11px] text-ink">
                            {p?.name ?? "Someone"}
                          </span>
                          <span className="truncate text-[10px] text-muted">
                            {p?.title ?? ""}
                          </span>
                        </div>
                        <p className="mt-1 pl-4 text-[11px] leading-relaxed text-ink/80">
                          &ldquo;{r.reason}&rdquo;
                        </p>
                        <p className="mt-0.5 pl-4 text-[10px] text-faint">
                          {r.problemId
                            ? r.wouldPay
                              ? "Has this problem · would pay"
                              : "Has this problem · would not pay"
                            : "None of these are their problem"}
                        </p>
                      </button>
                    );
                  })
              ) : (
                <p className="text-xs leading-relaxed text-faint">
                  {listening
                    ? "Every answer is collected here once everyone has spoken. For now, one voice at a time, top right."
                    : "Answers appear here once the crowd has spoken."}
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
