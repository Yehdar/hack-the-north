"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  Globe,
  type GlobeArc,
  type GlobeDot,
  type GlobePlace,
} from "@/components/globe/Globe";
import { Narrator } from "@/components/Narrator";
import { Hint } from "@/components/Hint";
import { AgentBoot, MARKET_STEPS } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { Intake } from "@/components/Intake";
import { SystemPanel } from "@/components/hud/SystemPanel";
import { LightRow } from "@/components/Light";
import { Meter } from "@/components/Progress";
import { PersonaCall } from "@/components/PersonaCall";
import { StageRail, deriveStages, type Segment } from "@/components/StageRail";
import { Reveal } from "@/components/Reveal";
import { Finding } from "@/components/Finding";
import { Door, DOOR_MS, armDoor } from "@/components/Door";
import { useVenture } from "@/lib/store";
import { diffSessions, summariseCrowd, useSessions, type SessionDelta } from "@/lib/sessions";
import { streamPost } from "@/lib/sse";
import { aggregate } from "@/lib/discovery/aggregate";
import { SpeechQueue } from "@/lib/voice/agentVoices";
import { detectTier, speak, unlockAudio, type VoiceTier } from "@/lib/voice/client";
import { mayStartSpeaking, narrationKey, useNarratorVoice } from "@/lib/voice/narrator";
import { hubById } from "@/data/globePoints";
import { FIRMS } from "@/data/firms";
import type { AgentVerdict, PVSBreakdown, ProblemStatement } from "@/lib/types";
import type { Attention, CrowdReaction, CrowdVerdict, FigureKind } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import { pvsReason } from "@/lib/pvs";
import { CouncilStage, type StageMessage, type StageTask } from "@/components/CouncilStage";
import { assess, diagnoseNoMarket } from "@/lib/advice";
import { Assessment } from "@/components/Assessment";
import { Bet } from "@/components/Bet";
import { OtherProblems } from "@/components/OtherProblems";
import { ProblemPopup } from "@/components/ProblemPopup";

// ============================================================================
// PART 1, DISCOVERY, in segments.
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
  figure: FigureKind;
  title: string;
  /** What to call them on screen: their job, or for a consumer product their
   *  age and interests, because that is how they were asked. */
  label?: string;
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
  kind: StageMessage["kind"];
  text: string;
  /** The challenge this answers, when it is an answer. */
  inReplyTo?: string;
};

type CouncilSeat = { id: string; role: string; weight: number };

type Batch = { done: number; total: number; batch: CrowdReaction[] };

/** Re-running the rewrite against the same people and problems as run one. */
type RunOptions = {
  problems?: ProblemStatement[];
  personaIds?: number[];
  /** The founder's own problem, typed at intake. */
  founderProblem?: string;
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

/** Nothing new from the stream for this long, while the screen is waiting on
 *  it rather than on the founder, and the founder is offered a way on. Real
 *  model calls can take a while; this only offers, it never decides. */
const STALL_MS = 25_000;
const STALL_LINE =
  "Nothing new has come back for a while. The model may just be slow, or stuck. Keep waiting, or carry on with what has arrived.";

/** Roughly how long a line takes to read, clamped so the room never stalls. */
function readingTime(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.min(3600, Math.max(1600, 700 + words * 75));
}

const COUNCIL_ROUND: Record<number, { title: string; line: string }> = {
  1: {
    title: "Round 1 · on their own",
    line: "Each agent answers the question the chair gave them, without hearing the others first.",
  },
  2: {
    title: "Round 2 · cross-examination",
    line: "Now they've heard each other, and they push back on specific claims, by name. Each challenge is a line from one agent to another.",
  },
  3: {
    title: "Round 3 · rebuttal",
    line: "The agents who were challenged answer. And some change their minds. A green line means someone conceded.",
  },
  4: {
    title: "Round 4 · the Contrarian",
    line: "The Contrarian argues against wherever the room has landed.",
  },
};

// The boot plays once per page load. Coming back from Part 2 is not a cold start.
let booted = false;

const hubName = (id: string) => hubById(id)?.label ?? id;

// Where the idea is sent out from when the crowd deploys. Hack the North.
const HOME = hubById("waterloo") ?? { lat: 43.46, lon: -80.52 };

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
  /** What came out of each call, newest first. */
  const [callReport, setCallReport] = useState<
    { personaId: number; name: string; role: string; summary: string; takeaway: string; at: number }[]
  >([]);
  /** Bought by people for themselves, so the crowd was asked as consumers. */
  const [consumer, setConsumer] = useState(false);
  const [reactions, setReactions] = useState<Map<number, CrowdReaction>>(new Map());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [verdict, setVerdict] = useState<CrowdVerdict | null>(null);
  const [signals, setSignals] = useState<CrowdSignals | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  /** Step two opens as a pop-up: the reading, then the problems. Closing it
   *  puts the other framings in the corner of the globe. */
  const [problemPopup, setProblemPopup] = useState(true);
  /** What the founder typed in the optional problem box at intake, kept so the
   *  pop-up can show it back to them. Null when they left it blank, which is
   *  most runs. */
  const [statedProblem, setStatedProblem] = useState<string | null>(null);
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
  /** Round 0: the question the chair handed each agent. */
  const [councilTasks, setCouncilTasks] = useState<StageTask[]>([]);
  const [councilRound, setCouncilRound] = useState(0);
  const [pvs, setPvs] = useState<PVSBreakdown | null>(null);

  // ---- come back to a finished run and find it still here -----------------
  //
  // Going to the committee and pressing back used to show "Nobody asked yet"
  // over an empty globe, while the dashboard listed the same run as complete.
  // The run was in the store the whole time; this screen's copy of it was not.
  //
  // Restores once, only when this screen has nothing and the store has a
  // finished run. So it can never stamp on a run in progress.
  // Which project this screen is working on. The active record if there is
  // one, otherwise the newest run of the same idea, so a reload or a jump back
  // from the committee still knows what it is called.
  const projects = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const activeProject =
    projects.find((p) => p.id === activeId) ??
    projects.find((p) => p.solution === ventureFile?.solution);



  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;

    const { ventureFile: vf, crowd, deployed } = useVenture.getState();
    if (!vf || !crowd?.verdict || !deployed?.length) return;
    if (personas.length > 0 || segment !== "idle") return;

    restored.current = true;
    const people = deployed as unknown as DeployedPersona[];

    // Deferred out of the effect body on purpose. Restoring seven pieces of
    // state synchronously inside an effect cascades a second render before the
    // first has painted, and touching the playback refs from here makes the
    // compiler treat them as frozen everywhere else in the file.
    queueMicrotask(() => {
      setPersonas(people);
      setProblems(vf.extractedProblems ?? []);
      setReactions(new Map(crowd.verdict.reactions.map((r) => [r.personaId, r])));
      setVerdict(crowd.verdict);
      setSignals(crowd.signals);
      setHubRanking(rankFromCrowd(crowd.verdict, people));
      if (vf.pvs) setPvs(vf.pvs);

      // Land on the last beat the run reached rather than replaying it, and do
      // not narrate what the founder already heard.
      setSegment(vf.pvs ? "deliberated" : "heard");
    });
    // Deliberately does not touch the playback refs. Landing on a finished
    // beat leaves auto-advance nothing to do, and letting the narrator read
    // that beat once is right. It says where you are.
  }, [segment, personas.length]);

  // ---- hearing the council. Off by default, like the committee's: a page
  // that starts talking on its own is hostile.
  const [hear, setHear] = useState(false);
  const hearRef = useRef(false);
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [voiced, setVoiced] = useState<string | null>(null);
  /** One queue for every voice on this screen. The council and the narrator
   * , so two of them never talk at once. */
  const speech = useRef<SpeechQueue | null>(null);
  const narratorOn = useNarratorVoice((s) => s.on);
  const toggleNarrator = useNarratorVoice((s) => s.toggle);
  const narrated = useRef("");

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
  /** When the screen last moved, and whether it has sat waiting on the stream
   *  long enough to offer the founder a way past it. */
  const idleSince = useRef(0);
  const stalledRef = useRef(false);
  /** The stream has closed. One that closed without its last event is not
   *  coming back, so there is no point making the founder wait it out. */
  const runEnded = useRef(false);
  const councilEnded = useRef(false);
  const [stalled, setStalled] = useState(false);
  /** A rewrite run already knows its problems and crowd, so it walks itself
   *  through those segments and slows down for the answers. */
  const auto = useRef(false);
  // The same flag for render; the ref is for the pacing loop's closures.
  const [autoRun, setAutoRun] = useState(false);
  /** Each run owns the screen; a stale stream from an earlier run is ignored. */
  const runToken = useRef(0);
  const councilToken = useRef(0);

  const personasRef = useRef<DeployedPersona[]>([]);
  /** The saved run this screen is showing, so later beats land on it. */
  const sessionRef = useRef<string | null>(null);
  const parentRef = useRef<string | null>(null);

  const intakeOpen = !booting && (!ventureFile || refine !== null);

  useEffect(() => {
    void detectTier().then(setTier);
    return () => speech.current?.stop();
  }, []);

  const ensureSpeech = useCallback(() => {
    speech.current ??= new SpeechQueue(
      // Playback only needs synthesis, which browsers without speech
      // recognition still have, the "text" tier is about the microphone.
      (text, voice) => speak(text, voice, tier === "elevenlabs" ? "elevenlabs" : "browser"),
      (agentId, id) => setVoiced(agentId === "narrator" ? null : id)
    );
    return speech.current;
  }, [tier]);

  const toggleHear = () => {
    // Inside the click, because browsers silently refuse audio that no
    // gesture started.
    unlockAudio();
    if (hear) {
      speech.current?.clear();
      setVoiced(null);
    } else {
      ensureSpeech();
    }
    hearRef.current = !hear;
    setHear(!hear);
  };

  // ---------------------------------------------------------------- the run
  const run = useCallback((opts: RunOptions = {}) => {
    // Read the store directly: the intake writes the file and calls run() in
    // the same tick, before any re-render could hand this callback the new file.
    const vf = useVenture.getState().ventureFile;
    if (!vf) return;

    speech.current?.clear();
    // The report grades from the crowd and the committee; never let it grade
    // this run with the last one's.
    useVenture.setState({ crowd: null, deliberation: null });
    stalledRef.current = false;
    setStalled(false);
    runEnded.current = false;
    const token = ++runToken.current;
    const pending = useVenture.getState().pending;
    const sessionId = useSessions.getState().begin(
      vf.solution,
      opts.parentId,
      pending?.name
    );
    sessionRef.current = sessionId;
    parentRef.current = opts.parentId ?? null;
    auto.current = Boolean(opts.parentId);
    setAutoRun(auto.current);
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
    setProblemPopup(true);
    setExpecting(0);
    setDeployReady(false);
    setProblems([]); setPersonas([]); setReactions(new Map());
    setVerdict(null); setSignals(null); setShowReveal(false); setFocus(null); setCallReport([]);
    setProgress({ done: 0, total: 0 });
    setHubRanking([]); setCouncilHub(null); setCouncilLog([]); setCouncilRoster([]); setCouncilTasks([]);
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
        founderProblem: opts.founderProblem,
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
            setConsumer(Boolean(ev.consumer));
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
    ).then(() => {
      if (token === runToken.current) runEnded.current = true;
    }, fail);
  }, []);

  // A project created on the dashboard arrives here already described, so the
  // run starts by itself. Without this the screen sat on a finished venture
  // file with nothing running: pressing "Change" reopened the form with the
  // same text still in it, and Part 2 stayed locked because no problem was
  // ever chosen.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || booting || !ventureFile) return;
    const pending = useVenture.getState().pending;
    if (!pending) return;

    autoStarted.current = true;
    queueMicrotask(() => {
      if (pending.founderProblem) setStatedProblem(pending.founderProblem);
      run({ founderProblem: pending.founderProblem });
      useVenture.getState().setPending(null);
    });
  }, [booting, ventureFile, run]);


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
    };

    // Progress is anything new on screen. Waiting on the founder is not a
    // stall; waiting on the stream is, once it has gone on long enough.
    idleSince.current = performance.now();
    const moved = () => {
      idleSince.current = performance.now();
      if (stalledRef.current) {
        stalledRef.current = false;
        setStalled(false);
      }
    };
    const starved = (now: number) => {
      const ended = segment === "council" ? councilEnded.current : runEnded.current;
      if (!stalledRef.current && (ended || now - idleSince.current > STALL_MS)) {
        stalledRef.current = true;
        setStalled(true);
      }
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
          moved();
          nextAt.current = now + (quick || auto.current ? 150 : PACE.problem);
        } else if (all.length === 0) {
          starved(now);
        } else if (auto.current) {
          nextAt.current = now + 400;
          setSegment("deploy");
        }
        return;
      }

      if (segment === "deploy") {
        if (personasRef.current.length === 0) {
          const crowd = bufPersonas.current;
          if (crowd.length === 0) return starved(now);
          moved();
          personasRef.current = crowd;
          setPersonas(crowd);
          // Survives navigating away. The crowd verdict has reactions but no
          // coordinates, so without this the globe comes back empty.
          useVenture.getState().setDeployed(crowd);
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
          moved();
          nextAt.current = now + (quick ? 90 : PACE.batch);
        } else if (bufVerdict.current) {
          skipping.current = false;
          setSegment("heard");
        } else {
          starved(now);
        }
        return;
      }

      // ---- the council, one event at a time
      const queue = councilQueue.current;
      if (councilShown.current >= queue.length) return starved(now);
      const ev = queue[councilShown.current];

      // Heard, not only read: the next line (and the council's end) waits
      // until the last line has been said, so the voices and the transcript
      // never drift apart the way the committee's used to. A line being
      // spoken is progress, not a stall.
      if ((ev.type === "message" || ev.type === "done") && !quick && speech.current?.busy) {
        moved();
        return;
      }

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
      moved();
      switch (ev.type) {
        case "start":
          setCouncilRoster(ev.roster as CouncilSeat[]);
          nextAt.current = now + (quick ? 60 : 600);
          break;
        case "task":
          setCouncilTasks((t) => [...t, ev.task as StageTask]);
          nextAt.current = now + (quick ? 30 : 450);
          break;
        case "message": {
          const m = ev.message as CouncilMsg;
          setCouncilLog((l) => [...l, m]);
          if (!quick && hearRef.current) speech.current?.push(m.id, m.from, m.text);
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
    speech.current?.clear();
  };

  /** Everyone has answered: put the market's answer on screen. */
  const revealResult = useCallback(() => {
    const v = bufVerdict.current;
    if (!v) return;
    setVerdict(v);
    setSignals(bufSignals.current);
    useVenture.getState().setCrowd(v, bufSignals.current);
    setHubRanking(rankFromCrowd(v, personasRef.current));

    const saved = useSessions.getState().sessions;
    const mine = saved.find((s) => s.id === sessionRef.current);
    const parent = parentRef.current ? saved.find((s) => s.id === parentRef.current) : undefined;
    setDelta(mine && parent ? diffSessions(parent, mine) : null);

    setSegment("result");
    // Nobody claiming a problem is an outcome with plenty to say, not a reason
    // to show nothing.
    setTimeout(() => setShowReveal(true), 200);
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
      speech.current?.clear();

      councilQueue.current = [];
      councilShown.current = 0;
      lastRound.current = 0;
      roundAnnounced.current = false;
      pendingPvs.current = null;
      skipping.current = false;
      nextAt.current = 0;

      stalledRef.current = false;
      setStalled(false);
      councilEnded.current = false;
      setCouncilHub(hubId);
      setCouncilLog([]); setCouncilStances({}); setCouncilRoster([]); setCouncilRound(0);
      setCouncilTasks([]);
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
      })
        .then(() => {
          if (token === councilToken.current) councilEnded.current = true;
        })
        .catch(() => {
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
  const walkThroughDoor = useCallback(() => {
    setFinding(false);
    setDoor("open");
    setTimeout(() => setDoor("closed"), 40);
    setTimeout(() => {
      armDoor();
      router.push("/committee");
    }, 40 + DOOR_MS + 200);
  }, [router]);

  const enterCommittee = useCallback(() => {
    acceptMarketProblem();
    walkThroughDoor();
  }, [acceptMarketProblem, walkThroughDoor]);

  /**
   * Straight to Part 2 with whatever Part 1 has established. For a stream that
   * never came back, or a market that has none of the candidate problems. The
   * committee already treats a missing validation as a finding rather than
   * refusing to sit, so nothing is invented to get there.
   */
  const forceCommittee = useCallback(() => {
    const vf = useVenture.getState().ventureFile;
    if (!vf) return;
    // Late events from either stream land on nothing.
    runToken.current++;
    councilToken.current++;
    speech.current?.clear();

    if (verdict?.marketProblemId) {
      acceptMarketProblem();
    } else {
      replaceVenture({
        ...vf,
        version: vf.version + 1,
        extractedProblems: problems.length > 0 ? problems : vf.extractedProblems,
        // Cleared rather than kept: a problem chosen in an earlier run was not
        // validated by this one.
        chosenProblem: undefined,
        pvs: undefined,
      });
    }
    walkThroughDoor();
  }, [verdict, acceptMarketProblem, replaceVenture, problems, walkThroughDoor]);

  /** Past a stream that has stopped arriving, keeping everything that came. */
  const moveOn = () => {
    stalledRef.current = false;
    setStalled(false);
    speech.current?.clear();

    if (segment === "listen" && bufBatches.current.length > 0) {
      // Grade the people who did answer. The remainder, if it ever arrives,
      // is dropped with the run token.
      runToken.current++;
      const answered = bufBatches.current.flatMap((b) => b.batch);
      const v = aggregate(answered, bufProblems.current);
      bufVerdict.current = v;
      bufSignals.current = null;
      if (sessionRef.current) {
        const ranking = rankFromCrowd(v, personasRef.current);
        useSessions.getState().record(
          {
            ...summariseCrowd(v, null, bufProblems.current, answered.length),
            topHub: ranking[0] ? { hubId: ranking[0].hubId, fitScore: ranking[0].fitScore } : undefined,
          },
          sessionRef.current
        );
      }
      revealResult();
      return;
    }

    if (segment === "council") {
      // Close the council on what it has said. Without a score it goes to the
      // committee unscored, which the committee is told.
      councilToken.current++;
      skipping.current = false;
      setSegment("deliberated");
      return;
    }

    // Nothing usable arrived at all.
    forceCommittee();
  };

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
      figure: p.figure,
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

  // What the run means, in words. It was written for the report and rendered
  // only there, after the committee. A founder needs it the moment the crowd
  // has answered, which is here.
  const advice = useMemo(
    () =>
      verdict
        ? assess(verdict, signals, pvs ?? undefined, Object.values(councilStances), (id) =>
            councilRoster.find((r) => r.id === id)?.role ?? id
          )
        : null,
    [verdict, signals, pvs, councilStances, councilRoster]
  );

  // The bet on screen: what was pitched until the crowd answers, then what
  // they actually said they have.
  const marketProblem = problems.find((p) => p.id === verdict?.marketProblemId);
  const pitchedProblem = problems.find((p) => p.id === verdict?.pitchedProblemId);
  const marketVote = verdict?.problemVotes.find((v) => v.problemId === verdict.marketProblemId);
  const bet = marketProblem ?? problems.find((p) => p.id === verdict?.pitchedProblemId) ?? problems[0];
  const betIsMarket = Boolean(marketProblem && marketProblem.id !== verdict?.pitchedProblemId);
  /** Only before anyone has answered: after that, an edit would be a new run. */
  const canRewriteBet = problems.length > 0 && !verdict && reactions.size === 0;

  /** Opening a call hands the floor to the person on it: the narrator stops
   *  mid-sentence rather than talking over their hello. */
  const openCall = useCallback(
    (personaId: number) => {
      // The narrator stops mid sentence rather than talking under a hello.
      ensureSpeech().drop("narrator");
      setFocus(personaId);
    },
    [ensureSpeech]
  );

  const endCall = useCallback(() => {
    speech.current?.drop("call");
    setFocus(null);
  }, []);

  /** One of the other framings, tested in place of the current one. */
  /** The founder's own wording for their claim. Same run, same people, their
   *  sentence: the test is only fair if the bet is theirs. */
  const rewriteBet = useCallback(
    (statement: string) => {
      const [first, ...rest] = problems;
      if (!first || !statement.trim()) return;
      run({ problems: [{ ...first, statement: statement.trim() }, ...rest] });
    },
    [problems, run]
  );

  const useProblem = useCallback(
    (chosen: { id: string }) => {
      const rest = problems.filter((p) => p.id !== chosen.id);
      const picked = problems.find((p) => p.id === chosen.id);
      if (picked) run({ problems: [picked, ...rest] });
    },
    [problems, run]
  );

  const focused = focus ? personas.find((p) => p.id === focus) : null;
  // While a council sits, the argument is the main thing on screen: the side
  // panel widens into it and the globe steps back.
  const councilView =
    councilHub !== null && (segment === "council" || segment === "deliberated" || segment === "scored");
  /** Step two: the problem, centred on the globe. Nothing else is on screen. */
  const splitView = segment === "split";
  // Centred on the globe. The column that used to sit under the caption was
  // four problem cards deep; it is one card at the top now, so nothing is in
  // the way and the line belongs in the middle.
  const centreClear = { left: "50%", maxWidth: "calc(100% - 48px)" };
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
        title: "Product",
        line: "Describe what you built. The market decides which problem it solves.",
      };
    }
    switch (segment) {
      case "split":
        return expecting > 0 && problems.length >= expecting
          ? {
              step: 2,
              title: "Problem",
              line: "This is the problem your product implies. Rewrite it if it is not your claim, then choose who to ask.",
            }
          : {
              step: 2,
              title: "Problem",
              line: "Reading the pitch for the problem it claims somebody has.",
            };
      case "deploy":
        return deployReady
          ? {
              step: 3,
              title: "Sample",
              line: consumer
                ? `${personas.length} people across ${cities} cities, asked as themselves rather than in their job. Select anyone to speak with them.`
                : `${personas.length} people across ${cities} cities whose work touches this, many with budget authority. Select anyone to speak with them.`,
            }
          : {
              step: 3,
              title: "Sample",
              line: "Selecting who should be asked.",
            };
      case "listen":
        return {
          step: 4,
          title: "Responses",
          line: `Each person is asked which problem they have, not whether they like the product. ${progress.done} of ${progress.total || personas.length} have answered.`,
        };
      case "heard":
        return {
          step: 4,
          title: "Responses",
          line: "Everyone has answered. Ready to see what the market said.",
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
              title: `Council · ${hubName(councilHub ?? "")}`,
              line: "Five analysts are about to assess whether this problem is worth solving here.",
            };
      case "deliberated":
        return {
          step: 6,
          title: "Council",
          line: "The council has finished. Next, what it adds up to.",
        };
      case "scored":
        return pvs
          ? {
              step: 7,
              title: "Validation",
              line: pvs.passed
                ? `${pvs.total} out of 100, which clears the bar of ${pvs.threshold}. A committee is ready to test it.`
                : `${pvs.total} out of 100, below the bar of ${pvs.threshold}, mostly because ${pvsReason(pvs)}. You may still pitch; the committee will be told.`,
            }
          : {
              step: 7,
              title: "Validation",
              line: "The council ended early, so there is no score for this run. You may still pitch it.",
            };
      case "result":
        if (!verdict?.marketProblemId) {
          return {
            step: 5,
            title: "Result",
            line: "Nobody we asked claimed any of these problems. That is a finding in itself.",
          };
        }
        return verdict.mismatch
          ? {
              step: 5,
              title: "Result",
              // In words. "You pitched p1. The market has p2" read out schema
              // ids to an audience that has never seen the schema.
              line: `The market has a different problem from the one you pitched, and ${Math.round((marketVote?.payRate ?? 0) * 100)}% of those who have it would pay to fix it. Next, whether it is worth solving, and where.`,
            }
          : {
              step: 5,
              title: isRerun ? "Result · run two" : "Result",
              line: "The market has the problem you pitched. Next, whether it is worth solving, and where.",
            };
      default:
        return {
          step: 1,
          title: "Ready",
          line: "Your idea is read for the problem it implies, then 120 people are asked which problem they actually have.",
        };
    }
  })();

  const next: NextStep | null = !ventureFile
    ? null
    : segment === "idle"
      ? "run"
      : segment === "split"
        ? expecting > 0 && problems.length >= expecting && !autoRun
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
    splitting: "Reading your idea…",
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

  // Offered, never forced: a slow model looks exactly like a stuck one.
  const stuck = stalled && PLAYING.includes(segment);

  // ---- the narrator, out loud: each new line once, through the same queue as
  // the council, never over a call, never before the founder has clicked.
  const narratorLine = stuck ? STALL_LINE : guide.line;
  const inCall = Boolean(focused);
  useEffect(() => {
    if (!narratorOn || inCall) {
      speech.current?.drop("narrator");
      // Muted: forget what was said, so unmuting reads the current line.
      if (!narratorOn) narrated.current = "";
      return;
    }
    if (booting || intakeOpen) return;
    const key = narrationKey(guide.title, narratorLine);
    if (key === narrated.current) return;
    narrated.current = key;
    if (!mayStartSpeaking()) return;
    ensureSpeech().replace(`narr:${key}`, "narrator", narratorLine);
  }, [narratorOn, inCall, booting, intakeOpen, guide.title, narratorLine, ensureSpeech]);
  const moveOnLabel =
    segment === "listen" && progress.done > 0
      ? `Grade the ${progress.done} who answered ▸`
      : segment === "council"
        ? "End the council here ▸"
        : "Skip to the committee ▸";

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
      ? { step: "Reading your idea", unit: "Framings weighed", done: problems.length, total: expecting || 4 }
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
            onDone={(_solution, founderProblem) => {
              const r = refine;
              setRefine(null);
              // Refine mode has no problem box, so leave run one's answer alone
              // rather than blanking it with an undefined.
              if (!r) setStatedProblem(founderProblem?.trim() || null);
              run(
                r
                  ? {
                      problems: r.problems,
                      personaIds: r.personaIds,
                      parentId: r.parentId,
                      walkedInWith: r.walkedInWith,
                    }
                  : { founderProblem }
              );
            }}
          />
        )}
      </AnimatePresence>

      <div className="flex h-full">
        <StageRail
          state={stages}
          solution={ventureFile?.solution}
          rerun={isRerun}
          onReset={() => resetVenture()}
          projectName={activeProject?.name}
          onRename={
            activeProject
              ? (name) => useSessions.getState().rename(activeProject.id, name)
              : undefined
          }
          under={
            bet && problems.length > 1 ? (
              <OtherProblems
                problems={problems.filter((p) => p.id !== bet.id)}
                onUse={canRewriteBet ? useProblem : undefined}
              />
            ) : null
          }
          onJump={(id) => {
            if (id === "reveal" && marketProblem && pitchedProblem) setShowReveal(true);
            if (id === "pitch" && marketProblem) setFinding(true);
          }}
        />

        <div className="relative flex-1">
          <Globe
            dots={dots}
            places={places}
            onDotClick={(id) => openCall(Number(id.slice(1)))}
            // Whoever you are talking to waves hello, from the globe or the list.
            selected={focus ? `p${focus}` : null}
            // Hack the North in view while the idea is split and sent out, then
            // the council's city. Not dead centre: every great circle through
            // the point under the camera projects as a straight line, so from
            // directly above Waterloo the arcs fanned out as a starburst of
            // rays. From due south they read as the arcs they are, and
            // Waterloo sits top centre, clear of the panels either side.
            focus={
              // Whoever you are talking to is turned into the upper half of
              // the globe: the call card opens over the lower half, and a
              // hello nobody can see is no hello.
              focused
                ? { lat: Math.max(-70, focused.lat - 18), lon: focused.lon }
                : councilPoint
                ? { lat: councilPoint.lat, lon: councilPoint.lon }
                : segment === "split" || segment === "deploy"
                  ? { lat: HOME.lat - 28, lon: HOME.lon }
                  : null
            }
            beacon={councilPoint ? { lat: councilPoint.lat, lon: councilPoint.lon } : null}
            arcs={arcs}
            distance={councilView ? 7.6 : undefined}
            className="h-full w-full"
          />

          {/* ---------------------------------------------------- narrator */}
          {/* Sits on the action it explains: what is happening, then the button. */}
          {!intakeOpen && !focused && (
            <div
              className="absolute bottom-[76px] z-30 w-[520px] -translate-x-1/2"
              style={centreClear}
            >
              <Narrator
                step={guide.step}
                title={guide.title}
                line={narratorLine}
                voice={{
                  on: narratorOn,
                  onToggle: () => {
                    unlockAudio();
                    toggleNarrator();
                  },
                }}
              />
            </div>
          )}

          {/* ---------------------------------------------------- top left */}
          <AnimatePresence>
            {splitView && problemPopup && panel && (
              <ProblemPopup
                key="problems"
                loading={problems.length === 0 || problems.length < expecting}
                progress={panel}
                provider={provider}
                solution={ventureFile?.solution}
                problem={statedProblem ?? undefined}
                others={bet ? problems.filter((p) => p.id !== bet.id) : []}
                onClose={() => setProblemPopup(false)}
              />
            )}
          </AnimatePresence>

          <div className="absolute left-6 top-6 z-40 w-[300px]">
            <AnimatePresence mode="wait">
              {panel && !splitView && (
                <ProcessingPanel
                  key="proc"
                  step={panel.step}
                  done={panel.done}
                  total={panel.total}
                  unit={panel.unit}
                  round={provider ? `provider ${provider}` : undefined}
                />
              )}
            </AnimatePresence>

            {/* candidate problems, one at a time */}
            {/* One bet, not four cards. The rivals are still asked about,
                because the crowd choosing one of them is the pivot. */}
            {bet && (
              <div className="mt-4 space-y-1.5">
                <p className="label">
                  {councilView
                    ? "The problem they're arguing about"
                    : betIsMarket
                      ? "What they actually struggle with"
                      : "The problem your product implies"}
                </p>
                <Bet
                  problem={bet}
                  label={betIsMarket || councilView ? "Their problem, in their words" : undefined}
                  isMarket={betIsMarket}
                  vote={verdict?.problemVotes.find((v) => v.problemId === bet.id)}
                  onRewrite={canRewriteBet ? rewriteBet : undefined}
                />
              </div>
            )}
          </div>

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
                centre={centreClear.left}
                queue={ensureSpeech}
                onSummarise={(entry) =>
                  setCallReport((r) => [
                    { ...entry, at: Date.now() },
                    ...r.filter((e) => e.personaId !== entry.personaId),
                  ])
                }
                onClose={endCall}
              />
            )}
          </AnimatePresence>

          {/* ---------------------------------------------------- controls */}
          {/* One button, always the next step. Its label says what happens. */}
          <div className="absolute bottom-6 z-40 -translate-x-1/2" style={{ left: centreClear.left }}>
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

              {stuck && (
                <button
                  onClick={moveOn}
                  title="Nothing new has arrived for a while. Carry on with what did."
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:brightness-125"
                  style={{ color: "var(--caution)" }}
                >
                  {moveOnLabel}
                </button>
              )}

              {/* Nobody in the crowd had any of the problems. Run again is the
                  honest next step, but not the only one on stage. */}
              {segment === "result" && verdict && !verdict.marketProblemId && (
                <button
                  onClick={forceCommittee}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
                >
                  Take it to the committee anyway →
                </button>
              )}

              {/* Offered from the reveal on, so it can be switched on before
                  the council convenes rather than halfway through it. */}
              {marketProblem &&
                (segment === "result" || segment === "council" || segment === "deliberated") && (
                  <button
                    onClick={toggleHear}
                    title={hear ? "The council is speaking aloud" : "Hear the council argue out loud"}
                    className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                      hear ? "text-accent" : "text-faint hover:text-ink"
                    }`}
                  >
                    {hear ? "🔊 hearing them" : "🔈 hear them"}
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
          className={`flex shrink-0 flex-col overflow-y-auto border-l border-edge bg-surface/40 transition-[width] duration-500 ease-out ${
            councilView ? "w-[min(640px,46vw)]" : "w-96"
          }`}
        >
          {/* ---- what it means: the conclusion, before the evidence ---- */}
          {advice && verdict && (
            <div className="border-b border-edge p-4">
              <Assessment
                advice={advice}
                bet={marketProblem ?? pitchedProblem}
                asked={verdict.reactions.length}
                have={marketVote?.votes ?? 0}
                payRate={marketVote?.payRate ?? 0}
                severity={marketVote?.meanSeverity ?? 0}
              />
            </div>
          )}

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
                    pitch. The committee is told.
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
                  ? `Clears the bar of ${pvs.threshold}. The weak spot the committee will find: ${pvsReason(pvs)}.`
                  : `Below the bar of ${pvs.threshold}, mostly because ${pvsReason(pvs)}. You can pitch anyway. The committee will be told you did.`}
              </p>
            </div>
          )}

          {/* ---- the council room ---- */}
          {councilRoster.length > 0 && councilHub && (
            <div className="border-b border-edge p-4">
              <CouncilStage
                city={hubName(councilHub)}
                roundTitle={councilRound ? COUNCIL_ROUND[councilRound]?.title : undefined}
                inSession={segment === "council"}
                seats={councilRoster}
                stances={councilStances}
                tasks={councilTasks}
                messages={councilLog as StageMessage[]}
                conceded={conceded}
                voiced={hear ? voiced : undefined}
              />
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
                    <Meter
                      label={hubName(h.hubId)}
                      value={h.fitScore}
                      color={
                        councilHub === h.hubId ? "var(--accent)" : "var(--border-bright)"
                      }
                    />
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
                zero would mean the crowd collapsed into one voice. Which is a bug, not a
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

          {/* ---- what the calls turned up ---- */}
          <div className="border-b border-edge p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="label">
                Report
                <Hint>
                  What came out of the calls you made. Talk to anyone in the crowd, then
                  summarise the conversation and it is kept here with the run.
                </Hint>
              </p>
              {callReport.length > 0 && (
                <span className="num text-[10px] text-faint">
                  {callReport.length} {callReport.length === 1 ? "call" : "calls"}
                </span>
              )}
            </div>
            {callReport.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-faint">
                Call someone from the crowd and summarise it, and the notes land here.
              </p>
            ) : (
              <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                {callReport.map((entry) => (
                  <div key={entry.personaId} className="border-l-2 border-edge pl-3">
                    <p className="text-[11px] text-ink">
                      {entry.name} <span className="text-muted">· {entry.role}</span>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink/80">{entry.summary}</p>
                    {entry.takeaway && (
                      <p className="mt-1 text-[10px] leading-relaxed text-muted">{entry.takeaway}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="label">
                {stanceFilter === "full"
                  ? "Supports"
                  : stanceFilter === "partial"
                    ? "Unsure"
                    : stanceFilter === "ignore"
                      ? "Rejected"
                      : "Community reactions"}
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
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
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
                        onClick={() => openCall(r.personaId)}
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
                            {p?.label ?? p?.title ?? ""}
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
                    ? "Every answer is collected here once everyone has spoken."
                    : "Answers appear here once the crowd has spoken."}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ------------------------------------------------------- THE REVEAL */}
      <AnimatePresence>
        {showReveal && pitchedProblem && verdict && (
          <Reveal
            pitched={pitchedProblem}
            market={marketProblem ?? null}
            noMarket={marketProblem ? null : diagnoseNoMarket(verdict, pitchedProblem)}
            aligned={!verdict.mismatch}
            votes={verdict.problemVotes}
            delta={delta}
            crowd={personas.length}
            problemCount={problems.length}
            city={hubRanking[0] ? hubName(hubRanking[0].hubId) : null}
            advice={advice}
            refining={refining}
            onAccept={acceptAndConvene}
            onRefine={() => void startRefine()}
            onClose={() => setShowReveal(false)}
            onAnyway={forceCommittee}
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
 * Hub ranking computed on the client from the reactions we already have. No
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
  const color =
    tone === "accent" ? "var(--accent)" : tone === "cold" ? "var(--cold)" : "var(--muted)";

  return (
    <div>
      <Meter label={label} value={n} max={total} color={color} />
    </div>
  );
}
