"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, type GlobeDot } from "@/components/globe/Globe";
import { AgentBoot } from "@/components/hud/AgentBoot";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import { AgentFeed, type FeedItem } from "@/components/hud/AgentFeed";
import { FirmPicker } from "@/components/FirmPicker";
import { Intake } from "@/components/Intake";
import { Door, disarmDoor, doorArmed } from "@/components/Door";
import { PartTwoNav } from "@/components/PartTwoNav";
import { Wordmark } from "@/components/Logo";
import { Narrator } from "@/components/Narrator";
import { DeliberationGraph } from "@/components/DeliberationGraph";
import { Hint } from "@/components/Hint";
import { HUB_POINTS, hubById, seatPointsAt } from "@/data/globePoints";
import { FIRMS } from "@/data/firms";
import { useVenture, type DeliberationSnapshot } from "@/lib/store";
import { SpeechQueue } from "@/lib/voice/agentVoices";
import { detectTier, speak, unlockAudio, type VoiceTier } from "@/lib/voice/client";
import { recordVerdict } from "@/lib/sessions";
import { streamPost } from "@/lib/sse";
import type { ICVerdict } from "@/lib/types";

// ============================================================================
// PART 2 — THE ROOM.
//
// The committee sits at the firm's own HQ and has read the file Part 1 wrote.
// It deliberates over five rounds before the founder says a word.
// ============================================================================

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

/** Nothing from the stream for this long and the founder is offered a way
 *  on. Real model calls can be slow; this only offers, it never decides. */
const STALL_MS = 30_000;

// What each round is for, in a sentence — the protocol explained while it runs.
const ROUND_MEANING: Record<number, string> = {
  0: "The chair splits the decision into questions and gives each to the one partner whose lane owns it.",
  1: "Each partner answers only their own questions, blind — nobody can anchor on anybody.",
  2: "Now they read each other, and challenge specific claims by name.",
  3: "Challenged partners answer, and may change their minds. Every change is recorded.",
  4: "The Devil's Advocate attacks wherever the room settled.",
};

export default function Committee() {
  // Arriving through the door from Part 1 replaces the boot sequence: the
  // doors are the transition, so the room should already be waiting.
  const [throughDoor] = useState(doorArmed);
  const [door, setDoor] = useState<"none" | "open" | "closed">(() =>
    doorArmed() ? "closed" : "none"
  );
  const [booting, setBooting] = useState(() => !doorArmed());

  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stances, setStances] = useState<Record<string, Verdict>>({});
  const [active, setActive] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  const [step, setStep] = useState("Idle");
  const [decision, setDecision] = useState<ICVerdict | null>(null);

  // Hearing the room argue is what makes the multi-agent claim land without
  // being explained. Off by default: audio that starts on its own is hostile.
  const [audio, setAudio] = useState(false);
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [nowSpeaking, setNowSpeaking] = useState<string | null>(null);
  const [voicedId, setVoicedId] = useState<string | null>(null);
  const queue = useRef<SpeechQueue | null>(null);
  // Each run owns the room; a stuck one is aborted when the founder runs again.
  const runId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const lastEventAt = useRef(0);
  const [stalled, setStalled] = useState(false);
  const [mindChanges, setMindChanges] = useState<DeliberationSnapshot["metrics"]["mindChanges"]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const ventureFile = useVenture((v) => v.ventureFile);
  const replaceVenture = useVenture((v) => v.replace);
  const resetVenture = useVenture((v) => v.reset);
  const setDeliberation = useVenture((v) => v.setDeliberation);

  useEffect(() => {
    void detectTier().then(setTier);
    return () => {
      queue.current?.stop();
      abort.current?.abort();
    };
  }, []);

  // A deliberation that has gone quiet: offer the founder a way on.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (performance.now() - lastEventAt.current > STALL_MS) setStalled(true);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  const firmId = useVenture((v) => v.firmId);
  const sidebar = useRef<HTMLDivElement>(null);

  const firm = FIRMS[firmId] ?? FIRMS.bessemer;
  const hq = hubById(firm.hqHubId) ?? hubById("sf")!;
  const seats = seatPointsAt(firm.hqHubId);

  useEffect(() => {
    if (!throughDoor) return;
    disarmDoor();
    const open = setTimeout(() => setDoor("open"), 900);
    const gone = setTimeout(() => setDoor("none"), 1800);
    return () => {
      clearTimeout(open);
      clearTimeout(gone);
    };
  }, [throughDoor]);

  useEffect(() => {
    sidebar.current?.scrollTo({ top: sidebar.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const dismiss = useCallback((id: string) => {
    setFeed((f) => f.filter((i) => i.id !== id));
  }, []);

  const newQueue = useCallback(
    () =>
      new SpeechQueue(
        // Playback only needs synthesis, which browsers without speech
        // recognition still have — the "text" tier is about the microphone.
        (text, voice) => speak(text, voice, tier === "elevenlabs" ? "elevenlabs" : "browser"),
        (agentId, id) => {
          setNowSpeaking(agentId);
          setVoicedId(id);
        }
      ),
    [tier]
  );

  const run = useCallback(() => {
    const vf = useVenture.getState().ventureFile;
    if (!vf) return;

    const id = ++runId.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    lastEventAt.current = performance.now();
    setStalled(false);
    let finished = false;

    setRunning(true);
    setMessages([]); setFeed([]); setStances({}); setDecision(null);

    queue.current?.stop();
    queue.current = audio ? newQueue() : null;
    setMindChanges([]); setRound(0); setStep("Convening"); setSelected(null);

    // What the start event establishes is needed again at the end of the same
    // stream. State would still hold the previous run's values by then, so it
    // is carried in locals — reading `roster` here once left the report with
    // an empty panel and every slider missing.
    let firmName = "";
    let seated: RosterEntry[] = [];

    void streamPost("/api/vc/deliberate", { ventureFile: vf, firmId }, (ev) => {
      if (id !== runId.current) return;
      lastEventAt.current = performance.now();
      setStalled(false);
      if (ev.type === "done" || ev.type === "error") finished = true;
      switch (ev.type) {
        case "start": {
          firmName = (ev.firm as { name: string }).name;
          seated = ev.roster as RosterEntry[];
          setProvider(ev.provider as string);
          setRoster(seated);
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
          // Queued, not spoken immediately — deliberation streams faster than
          // speech, so without a queue three partners talk over each other.
          queue.current?.push(m.id, m.from, m.text);
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
            finalVerdicts: DeliberationSnapshot["verdicts"];
            messages: DeliberationSnapshot["messages"];
            metrics: DeliberationSnapshot["metrics"];
          };
          const verdict = ev.verdict as ICVerdict;

          setDeliberation({
            firm: firmName,
            verdicts: result.finalVerdicts,
            messages: result.messages,
            roster: seated,
            metrics: result.metrics,
          });
          setDecision(verdict);
          setMindChanges(result.metrics.mindChanges);
          setStep("Committee concluded");
          setActive(new Set());
          setRunning(false);
          // Persist the verdict onto the venture file so the report and the
          // meeting both see it.
          replaceVenture({ ...vf, verdict });
          recordVerdict(vf.solution, {
            firmId,
            firmName,
            decision: verdict.decision,
            score: verdict.score,
            killShot: verdict.killShot,
          });
          break;
        }

        case "error":
          setStep("Failed");
          setRunning(false);
          break;
      }
    }, controller.signal)
      .then(() => {
        // Closed without a verdict: the server died mid-meeting. Waiting on
        // it would leave "Deliberating…" on screen forever.
        if (id === runId.current && !finished) setStalled(true);
      })
      .catch(() => {
        if (id !== runId.current) return;
        setStep("Failed");
        setRunning(false);
      });
  }, [replaceVenture, setDeliberation, firmId, audio, newQueue]);

  const seatDots = Object.values(seats);
  const dots: GlobeDot[] = [
    // Cities stay dots — except those under the committee's feet, which the
    // row of partners would stand on top of. The beacon marks the HQ itself.
    ...HUB_POINTS.filter(
      (h) => Math.hypot(h.lat - hq.lat, (h.lon - hq.lon) * Math.cos((hq.lat * Math.PI) / 180)) > 7
    ).map((h) => ({
      id: `hub:${h.id}`,
      lat: h.lat,
      lon: h.lon,
      label: h.label,
      weight: 0.25,
    })),
    ...seatDots.map((s) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      // Four seats round one city would stack four labels on top of each
      // other. Only whoever is speaking is named.
      label: active.has(s.id) ? s.label : "",
      stance: stances[s.id]?.stance,
      // The row reads as a panel only if nobody is dwarfed: size is the same
      // for every partner, and voting weight stays in the side panel.
      weight: 0.5,
      active: active.has(s.id),
      figure: s.figure,
      figureScale: 1.35,
    })),
  ];

  // Once the room convenes the argument is the thing to watch: the panel
  // widens and the globe steps back to make room for it.
  const convened = running || roster.length > 0;

  const problem = ventureFile?.chosenProblem;
  const pvs = ventureFile?.pvs;
  const researchedIn = ventureFile ? Object.values(ventureFile.hubFindings)[0] : undefined;
  const conceded = new Set(messages.filter((m) => m.kind === "concession").map((m) => m.from));

  const narration = decision
    ? {
        title: `Verdict · ${decision.decision}`,
        line: `Score ${decision.score.toFixed(2)}. ${
          decision.dissents.length > 0 ? "Dissent is kept, not averaged away. " : ""
        }Now defend it out loud — every question you dodge costs you at the vote.`,
      }
    : running && stalled
      ? {
          title: "The room has gone quiet",
          line: "Nothing has come back for a while — the model may be slow, or stuck. Keep waiting, run the committee again, or go straight to the pitch.",
        }
    : running
      ? { title: round ? ROUND_LABEL[round] : "Round 0 · decompose", line: ROUND_MEANING[round] }
      : {
          title: "The room",
          line: `${firm.name}'s partners have read your file. Convene them — they argue with each other before you say a word.`,
        };

  return (
    <main className="relative h-screen overflow-hidden bg-ground text-ink">
      {booting && <AgentBoot onComplete={() => setBooting(false)} />}
      {door !== "none" && (
        <Door state={door} title="The committee" subtitle={`${firm.name} · ${hq.label}`} />
      )}
      <AnimatePresence>
        {!booting && !ventureFile && <Intake onDone={() => undefined} />}
      </AnimatePresence>

      <div className="flex h-full">
        {/* ------------------------------- globe ------------------------------- */}
        <div className="relative flex-1">
          <Globe
            dots={dots}
            onDotClick={(id) => setSelected(id.startsWith("hub:") ? null : id)}
            selected={selected}
            focus={{ lat: hq.lat, lon: hq.lon }}
            beacon={{ lat: hq.lat, lon: hq.lon }}
            distance={convened ? 7.6 : undefined}
            className="h-full w-full"
          />

          <div className="absolute left-1/2 top-6 z-40 -translate-x-1/2">
            <PartTwoNav current="/committee" />
          </div>
          {ventureFile && (
            <div className="absolute bottom-[76px] left-1/2 z-30 w-[520px] max-w-[calc(100%-48px)] -translate-x-1/2">
              <Narrator title={narration.title} line={narration.line} />
            </div>
          )}

          {/* header: the room, and the file it read — below the Part 2 bar */}
          <div className="absolute left-6 top-20 z-40 w-[300px]">
            <AnimatePresence mode="wait">
              {running ? (
                <ProcessingPanel
                  key="proc"
                  step={step}
                  done={messages.length}
                  total={EXPECTED_TURNS}
                  round={round ? ROUND_LABEL[round] : undefined}
                />
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Wordmark size={18} />
                  <p className="label mt-3" style={{ color: "var(--accent)" }}>
                    Part two · the committee
                  </p>
                  <p className="mt-1 text-sm text-ink">{firm.name}</p>
                  <p className="label mt-0.5">
                    {hq.label} · {firm.decisionStyle}
                  </p>

                  {ventureFile && (
                    <div className="panel mt-4 p-3">
                      <p className="label">The file they read</p>
                      {problem ? (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-ink/85">
                          {problem.statement}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                          &ldquo;{ventureFile.solution}&rdquo; — no validated problem. The
                          committee will treat that as a finding.
                        </p>
                      )}
                      <div className="num mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
                        {pvs && (
                          <span>
                            PVS {pvs.total}
                            <span className={pvs.passed ? "text-positive" : "text-negative"}>
                              {pvs.passed ? " · cleared" : " · below the bar"}
                            </span>
                          </span>
                        )}
                        {researchedIn && (
                          <span>
                            {hubById(researchedIn.hubId)?.label ?? researchedIn.hubId} fit{" "}
                            {researchedIn.fitScore}
                          </span>
                        )}
                        {problem &&
                          ventureFile.extractedProblems[0] &&
                          ventureFile.extractedProblems[0].id !== problem.id && (
                            <span>research moved the framing</span>
                          )}
                      </div>
                      <button
                        onClick={() => resetVenture()}
                        className="label mt-2 underline-offset-4 hover:text-ink hover:underline"
                      >
                        Different idea
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AgentFeed items={feed} onDismiss={dismiss} top="top-20" />

          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="panel panel-bright absolute bottom-28 left-6 z-40 w-96 p-4"
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
                          <p className="font-mono text-sm text-ink">{entry?.role ?? selected}</p>
                          <p className="label mt-0.5">
                            weight {((entry?.weight ?? 0) * 100).toFixed(0)}% ·{" "}
                            {v ? `stance ${v.stance.toFixed(2)} · conf ${v.confidence.toFixed(2)}` : "no position yet"}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          className="px-2 font-mono text-xs text-faint hover:text-ink"
                        >
                          ✕
                        </button>
                      </div>

                      {v && <p className="mt-3 text-xs leading-relaxed text-ink/85">{v.position}</p>}

                      {moved && (
                        <p className="num mt-3 border border-positive/40 p-2 text-[11px] text-positive">
                          moved {moved.from.toFixed(2)} → {moved.to.toFixed(2)}
                          {moved.conceded && " after conceding"}
                        </p>
                      )}

                      {against.length > 0 && (
                        <div className="mt-3">
                          <p className="label" style={{ color: "var(--accent)" }}>
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
                        <p className="label mt-3">
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
          <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2">
            <div className="panel flex items-center gap-1 whitespace-nowrap p-1.5">
              <FirmPicker disabled={running} />
              {decision && !running ? (
                <>
                  <Link
                    href="/meeting"
                    className="beam bg-accent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
                  >
                    Now defend it →
                  </Link>
                  <button
                    onClick={run}
                    className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                  >
                    Run again
                  </button>
                </>
              ) : running && stalled ? (
                // Offered, never forced: a slow model looks exactly like a
                // stuck one. Running again aborts the stuck stream.
                <>
                  <button
                    onClick={run}
                    className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:brightness-125"
                    style={{ color: "var(--caution)" }}
                  >
                    Run it again ↻
                  </button>
                  <Link
                    href="/meeting"
                    className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
                  >
                    Skip to the pitch →
                  </Link>
                </>
              ) : (
                <button
                  onClick={run}
                  disabled={running || !ventureFile}
                  className={`bg-accent px-5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110 disabled:bg-edge disabled:text-faint ${
                    running || !ventureFile ? "" : "beam"
                  }`}
                >
                  {running ? "Deliberating…" : "Convene the committee"}
                </button>
              )}
              {/* Audio is opt-in and the toggle sits next to the run button,
                  because a page that starts talking on its own is hostile. */}
              <button
                onClick={() => {
                  unlockAudio();
                  if (audio) {
                    queue.current?.stop();
                    queue.current = null;
                    setNowSpeaking(null);
                    setVoicedId(null);
                  } else if (running) {
                    // Turned on mid-meeting: speak from the next line on.
                    queue.current = newQueue();
                  }
                  setAudio(!audio);
                }}
                title={
                  audio
                    ? "The room is speaking aloud"
                    : "Hear the partners argue out loud"
                }
                className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition ${
                  audio ? "text-accent" : "text-faint hover:text-ink"
                }`}
              >
                {audio ? "🔊 hearing them" : "🔈 hear them"}
              </button>

              {nowSpeaking && (
                <span className="label animate-pulse px-1" style={{ color: "var(--accent)" }}>
                  {nowSpeaking} speaking
                </span>
              )}

              {provider && <span className="label px-2">{provider}</span>}
            </div>
          </div>
        </div>

        {/* ------------------------------ sidebar ------------------------------ */}
        <aside
          className={`flex shrink-0 flex-col border-l border-edge bg-surface/40 transition-[width] duration-500 ease-out ${
            convened ? "w-[min(560px,40vw)]" : "w-96"
          }`}
        >
          <div className="border-b border-edge p-4">
            <p className="label">
              The room
              <Hint align="left">
                Run like a real partner meeting. The managing partner chairs and hands
                each question to the partner whose job it is; the partners give their
                view without hearing the others, then challenge each other by name,
                answer (and may change their minds), and the devil&apos;s advocate argues
                against wherever the room settled. Circle size is voting weight; colour is
                stance; a green tick means that partner conceded.
              </Hint>
            </p>
            {roster.length > 0 ? (
              <>
                <div className="mt-2">
                  <DeliberationGraph
                    seats={roster}
                    stances={stances}
                    messages={messages}
                    active={active}
                    conceded={conceded}
                    voiced={audio ? voicedId : undefined}
                  />
                </div>
                <div className="mt-3 space-y-1 border-t border-edge pt-3">
                  {roster.filter((r) => r.weight > 0).map((r) => {
                    const v = stances[r.id];
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        className="num flex w-full items-baseline justify-between text-left text-[11px] transition hover:text-ink"
                      >
                        <span className="text-ink/85">
                          {r.role} <span className="text-faint">{(r.weight * 100).toFixed(0)}%</span>
                        </span>
                        <span className={v ? (v.stance >= 0 ? "text-positive" : "text-negative") : "text-faint"}>
                          {v ? `${v.stance > 0 ? "+" : ""}${v.stance.toFixed(2)} · conf ${v.confidence.toFixed(2)}` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-3 font-mono text-xs leading-relaxed text-faint">
                Not yet convened. The lead partner who brought the deal, the principal who
                did the diligence and a skeptical partner vote; a devil&apos;s advocate
                argues against the room; the managing partner chairs and keeps the
                minutes.
              </p>
            )}
          </div>

          <div ref={sidebar} className="flex-1 overflow-y-auto p-4">
            <p className="label">Transcript</p>
            <div className="mt-3 space-y-2">
              {messages.map((m) => (
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
                  <p className="label text-positive">Minds changed</p>
                  {mindChanges.map((c) => (
                    <p key={c.agentId} className="num mt-1 text-[11px] text-muted">
                      {c.agentId} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                      {c.conceded && <span className="ml-1 text-positive">conceded</span>}
                    </p>
                  ))}
                </div>
              )}
              {decision && (
                <>
                  <p className="label">Verdict</p>
                  <p
                    className={`mt-1 font-mono text-2xl uppercase ${
                      decision.decision === "invest"
                        ? "text-positive"
                        : decision.decision === "pass"
                          ? "text-negative"
                          : "text-ink"
                    }`}
                  >
                    {decision.decision}
                  </p>
                  <p className="num text-[11px] text-faint">
                    score {decision.score.toFixed(3)}
                    {decision.dissents.length > 0 && (
                      <span className="text-accent"> · dissent: {decision.dissents.join(", ")}</span>
                    )}
                  </p>
                  <div className="mt-2 flex gap-4">
                    <Link href="/meeting" className="label transition hover:text-ink">
                      Pitch them →
                    </Link>
                    <Link href="/report" className="label transition hover:text-ink">
                      Read the report
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
