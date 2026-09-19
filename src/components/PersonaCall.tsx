"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  detectTier,
  speak,
  startCapture,
  stopSpeaking,
  unlockAudio,
  type Recorder,
  type VoiceProfile,
  type VoiceTier,
} from "@/lib/voice/client";
import type { CrowdReaction, FigureKind } from "@/lib/discovery/types";
import { FigureAvatar } from "@/components/FigureAvatar";
import { figureLook, shirtColor } from "@/components/globe/figures";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// CALL ONE PERSON.
//
// The crowd gives a founder a number. This gives them the follow-up question,
// which is where the insight actually is — three minutes with one sceptic beats
// a hundred sentiment scores.
//
// The person on the other end is held to what they already said in the crowd
// pass. They can be persuaded by a good argument and not by enthusiasm, which
// is the difference between research and a flattery machine.
// ============================================================================

type Turn = { speaker: "founder" | "persona"; text: string };

type Props = {
  persona: {
    id: number;
    name: string;
    figure: FigureKind;
    title: string;
    label?: string;
    city: string;
    hubId: string;
    why: string[];
  };
  reaction?: CrowdReaction;
  solution: string;
  problems: ProblemStatement[];
  onClose: () => void;
  /** Where to centre the card, when something else owns the left of the screen. */
  centre?: string;
};

const OPENERS = [
  "What would have to be true for you to pay for this?",
  "What do you do about this problem today?",
  "What would make you ignore this entirely?",
];

/** Who signs is a different question at home and at work. */
const WHO_PAYS = {
  consumer: "Would you buy this yourself, or does someone else decide?",
  business: "Who in your company would actually sign for this?",
};

export function PersonaCall({ persona, reaction, solution, problems, onClose, centre = "50%" }: Props) {
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  // The call opens ringing: they pick up and say hello before anything else.
  const [thinking, setThinking] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typed, setTyped] = useState("");
  const [sentiment, setSentiment] = useState(reaction?.sentiment ?? 0.5);
  const [shifted, setShifted] = useState(false);
  const [voice, setVoice] = useState<VoiceProfile | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void detectTier().then(setTier);
  }, []);

  // They pick up. Silenced if the founder hangs up before they have finished
  // saying hello. (React mounts twice in development; the first mount's hello
  // is hung up on and dropped, so it is still said once.)
  useEffect(() => {
    let hungUp = false;

    void Promise.all([
      fetch("/api/discovery/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: persona.id, solution, problems, reaction, greet: true }),
      }).then((r) => (r.ok ? r.json() : null)),
      detectTier(),
    ])
      .then(async ([json, t]) => {
        if (hungUp) return;
        setThinking(false);
        if (!json?.line) return;
        setTurns([{ speaker: "persona", text: json.line }]);
        setVoice(json.voice);
        setSpeaking(true);
        await speak(json.line, json.voice as VoiceProfile, t);
        if (!hungUp) setSpeaking(false);
      })
      .catch(() => !hungUp && setThinking(false));

    return () => {
      hungUp = true;
      stopSpeaking();
    };
    // Once per call: the card is keyed by the person, so a new person is a
    // new call and a new mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim()) return;
      setThinking(true);
      setTurns((t) => [...t, { speaker: "founder", text: question }]);

      try {
        const res = await fetch("/api/discovery/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personaId: persona.id,
            solution,
            problems,
            reaction,
            question,
            history: turns,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "call failed");

        setTurns((t) => [...t, { speaker: "persona", text: json.line }]);
        setSentiment(json.sentiment);
        if (json.shifted) setShifted(true);
        setVoice(json.voice);
        setThinking(false);

        setSpeaking(true);
        await speak(json.line, json.voice as VoiceProfile, tier ?? "text");
        setSpeaking(false);
      } catch {
        setThinking(false);
      }
    },
    [persona.id, solution, problems, reaction, turns, tier]
  );

  const pushToTalk = useCallback(async () => {
    unlockAudio();
    if (!tier || tier === "text") return;

    if (recording) {
      setRecording(false);
      const text = await recorder.current?.stop().catch(() => "");
      recorder.current = null;
      if (text) await ask(text);
      return;
    }
    try {
      recorder.current = await startCapture(tier);
      setRecording(true);
    } catch {
      /* mic unavailable — typing still works */
    }
  }, [tier, recording, ask]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      style={{ left: centre }}
      className="panel panel-bright absolute bottom-24 z-50 flex w-[520px] max-w-[calc(100%-32px)] -translate-x-1/2 flex-col p-4"
    >
      {/* who you are talking to — the same figure as on the globe, saying
          hello, and wearing how they feel right now */}
      <div className="flex items-stretch gap-4">
        <div
          className="relative flex w-[128px] shrink-0 items-end justify-center overflow-hidden rounded-[6px] border border-edge bg-ground pt-3"
          style={{
            boxShadow: speaking ? "0 0 0 1px var(--accent), 0 0 18px -4px var(--accent)" : undefined,
            transition: "box-shadow 200ms",
          }}
        >
          <FigureAvatar
            kind={persona.figure}
            {...figureLook(`p${persona.id}`)}
            shirt={shirtColor(reaction || turns.length > 1 ? sentiment * 2 - 1 : undefined)}
            waveKey={persona.id}
            speaking={speaking}
            size={124}
          />
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${thinking && turns.length === 0 ? "animate-pulse" : ""}`}
              style={{ background: thinking && turns.length === 0 ? "var(--caution)" : "var(--go)" }}
            />
            {thinking && turns.length === 0 ? "calling" : speaking ? "talking" : "on call"}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base text-ink">{persona.name}</p>
              <p className="label mt-0.5">
                {persona.label ?? persona.title} · {persona.city}
              </p>
            </div>
            <button onClick={onClose} className="num shrink-0 text-xs text-faint hover:text-negative">
              end call
            </button>
          </div>


      {/* live sentiment — moves as the conversation goes */}
      <div className="mt-3">
        <div className="flex justify-between num text-[10px] text-faint">
          <span>how they feel, live</span>
          <span>{sentiment.toFixed(2)}</span>
        </div>
        <div className="mt-1 h-1 bg-edge">
          <motion.div
            layout
            className="h-full"
            style={{
              width: `${sentiment * 100}%`,
              background: `color-mix(in srgb, var(--accent) ${sentiment * 100}%, var(--cold))`,
            }}
          />
        </div>
        {shifted && (
          <p className="mt-1 text-[10px] text-accent">You changed their mind.</p>
        )}
      </div>
          {reaction?.reason && !turns.some((t) => t.speaker === "founder") && (
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              They told the crowd: &ldquo;{reaction.reason}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* transcript */}
      <div ref={feed} className="mt-3 max-h-56 min-h-[64px] space-y-2 overflow-y-auto">
        {turns.length === 0 && !thinking && (
          <p className="text-[11px] leading-relaxed text-faint">Ask them something.</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.speaker === "founder" ? "text-right" : ""}>
            <p
              className={`inline-block max-w-[85%] px-2.5 py-1.5 text-[11px] leading-relaxed ${
                t.speaker === "founder"
                  ? "bg-surface-2 text-ink/85"
                  : "border border-edge bg-surface text-ink/90"
              }`}
            >
              {t.text}
            </p>
          </div>
        ))}
        {thinking && (
          <p className="animate-pulse text-[10px] text-faint">
            {turns.length === 0 ? `calling ${persona.name.split(" ")[0]}…` : "thinking…"}
          </p>
        )}
      </div>

      {/* openers — a founder who does not know what to ask learns nothing */}
      {!turns.some((t) => t.speaker === "founder") && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...OPENERS, persona.label ? WHO_PAYS.consumer : WHO_PAYS.business].map((q) => (
            <button
              key={q}
              onClick={() => void ask(q)}
              className="border border-edge px-2 py-1 text-left text-[10px] text-muted transition hover:border-edge-bright hover:text-ink"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* controls */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={pushToTalk}
          disabled={thinking || !tier || tier === "text"}
          className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition disabled:bg-edge disabled:text-faint ${
            recording ? "bg-negative text-ground" : "bg-accent text-ground hover:brightness-110"
          }`}
        >
          {recording ? "■ send" : "● talk"}
        </button>

        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            unlockAudio();
            const q = typed;
            setTyped("");
            void ask(q);
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="ask them something"
            className="min-w-0 flex-1 border border-edge bg-ground px-2 py-2 text-[11px] text-ink placeholder:text-faint focus:border-edge-bright focus:outline-none"
          />
        </form>
      </div>

      <p className="label mt-2">
        selected because {persona.why.join(", ") || "—"} · voice {tier ?? "…"}
        {voice && ` · pitch ${voice.pitch} rate ${voice.rate}`}
      </p>
    </motion.div>
  );
}
