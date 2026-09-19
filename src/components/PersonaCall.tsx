"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  detectTier,
  speak,
  startCapture,
  unlockAudio,
  type Recorder,
  type VoiceProfile,
  type VoiceTier,
} from "@/lib/voice/client";
import type { CrowdReaction } from "@/lib/discovery/types";
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
    title: string;
    city: string;
    hubId: string;
    why: string[];
  };
  reaction?: CrowdReaction;
  solution: string;
  problems: ProblemStatement[];
  onClose: () => void;
};

const OPENERS = [
  "What would have to be true for you to pay for this?",
  "What do you do about this problem today?",
  "Who in your company would actually sign for this?",
  "What would make you ignore this entirely?",
];

export function PersonaCall({ persona, reaction, solution, problems, onClose }: Props) {
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
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
      className="panel panel-bright absolute bottom-24 left-1/2 z-50 flex w-[440px] -translate-x-1/2 flex-col p-4"
    >
      {/* who you are talking to */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{
              background: speaking ? "var(--accent)" : "var(--border-bright)",
              boxShadow: speaking ? "0 0 12px var(--accent)" : "none",
            }}
          />
          <div>
            <p className="text-sm text-ink">{persona.name}</p>
            <p className="label mt-0.5">
              {persona.title} · {persona.city}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="num text-xs text-faint hover:text-ink">
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

      {/* transcript */}
      <div ref={feed} className="mt-3 max-h-56 min-h-[80px] space-y-2 overflow-y-auto">
        {turns.length === 0 && !thinking && (
          <p className="text-[11px] leading-relaxed text-faint">
            {reaction?.reason
              ? `They already told the crowd: "${reaction.reason}"`
              : "Ask them something."}
          </p>
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
        {thinking && <p className="animate-pulse text-[10px] text-faint">thinking…</p>}
      </div>

      {/* openers — a founder who does not know what to ask learns nothing */}
      {turns.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {OPENERS.map((q) => (
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
