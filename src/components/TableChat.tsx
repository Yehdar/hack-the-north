"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  detectTier,
  speak,
  startCapture,
  stopSpeaking,
  unlockAudio,
  type Recorder,
  type VoiceTier,
} from "@/lib/voice/client";
import { voiceFor } from "@/lib/voice/agentVoices";
import { opinionOf, OPINION_TONE } from "@/lib/lean";

// ============================================================================
// TALKING TO ONE PARTNER.
//
// Click a chair and the room steps aside for a conversation with that person.
// Speech bubbles, and the microphone writes into the box rather than sending,
// so a stumble is editable. A pitch is nervous work and dictation that fires
// the instant you stop talking punishes that.
//
// When the conversation closes it is summarised in one line and the partner's
// lean is re-read, because a conversation that changes nothing is not worth
// having had.
// ============================================================================

export type ChatTurn = { speaker: "founder" | "agent"; text: string };

export function TableChat({
  role,
  stance,
  opening,
  turns,
  thinking,
  speakingNow,
  onAsk,
  onClose,
}: {
  /** Kept in the call site for keying; the panel itself only needs the role. */
  seatId?: string;
  role: string;
  /** Their conviction right now, -1 to 1. Red or yellow is who you came here
   *  to win over; the header says so without making you guess from the tie. */
  stance?: number;
  /** What they said in the deliberation, so the conversation starts somewhere. */
  opening?: string;
  turns: ChatTurn[];
  thinking?: boolean;
  speakingNow?: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const opinion = OPINION_TONE[opinionOf(stance)];
  const [tier, setTier] = useState<VoiceTier | null>(null);
  const [typed, setTyped] = useState("");
  const [recording, setRecording] = useState(false);
  const [heard, setHeard] = useState("");
  const recorder = useRef<Recorder | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void detectTier().then(setTier);
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking]);

  const pushToTalk = useCallback(async () => {
    unlockAudio();
    if (!tier || tier === "text") return;

    if (recording) {
      setRecording(false);
      const text = await recorder.current?.stop().catch(() => "");
      recorder.current = null;
      setHeard("");
      if (text) setTyped((prev) => [prev, text].filter(Boolean).join(" "));
      return;
    }
    try {
      setHeard("");
      recorder.current = await startCapture(tier, setHeard);
      setRecording(true);
    } catch {
      /* no microphone; typing still works */
    }
  }, [tier, recording]);

  const send = () => {
    const q = typed.trim();
    if (!q) return;
    setTyped("");
    onAsk(q);
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 200, damping: 24 }}
      className="flex h-full w-[400px] shrink-0 flex-col border-l border-edge bg-surface/40"
    >
      <header className="flex items-start justify-between gap-3 border-b border-edge p-4">
        <div className="min-w-0">
          <p className="label" style={{ color: "var(--accent)" }}>
            In conversation with
          </p>
          <p className="mt-1 text-[15px] text-ink">{role}</p>
          <p className="label mt-1 flex items-center gap-1.5" style={{ color: opinion.color }}>
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: opinion.color, boxShadow: `0 0 6px -1px ${opinion.color}` }}
            />
            {opinion.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="label shrink-0 underline-offset-4 hover:text-ink hover:underline"
        >
          back to the room
        </button>
      </header>

      <div ref={feed} className="flex-1 space-y-3 overflow-y-auto p-4">
        {opening && turns.length === 0 && (
          <div className="border-l-2 border-edge-bright pl-3">
            <p className="label">what they said to the room</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              &ldquo;{opening}&rdquo;
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.speaker === "founder" ? "flex justify-end" : ""}>
            <p
              className={`max-w-[86%] rounded-[10px] px-3 py-2 text-[13px] leading-relaxed ${
                t.speaker === "founder"
                  ? "bg-accent text-ground"
                  : "border border-edge bg-surface text-ink"
              }`}
              style={
                t.speaker === "founder"
                  ? { borderBottomRightRadius: 3 }
                  : { borderBottomLeftRadius: 3 }
              }
            >
              {t.text}
            </p>
          </div>
        ))}

        {thinking && (
          <p className="label animate-pulse">{role.toLowerCase()} is thinking…</p>
        )}
        {speakingNow && (
          <p className="label" style={{ color: "var(--accent)" }}>
            speaking…
          </p>
        )}
      </div>

      <AnimatePresence>
        {recording && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-4"
          >
            <div className="glow-accent flex items-start gap-2 p-2.5">
              <span className="mt-1 flex shrink-0 gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ background: "var(--accent)" }}
                    animate={{ height: [4, 12, 4] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
                  />
                ))}
              </span>
              <p className="flex-1 text-[12px] leading-relaxed text-ink">
                {heard || <span className="text-muted">Listening…</span>}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        className="flex items-end gap-2 border-t border-edge p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          onClick={pushToTalk}
          disabled={!tier || tier === "text"}
          className={`shrink-0 rounded-[6px] px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition disabled:bg-edge disabled:text-faint ${
            recording ? "bg-negative text-ink" : "bg-surface-2 text-ink hover:brightness-125"
          }`}
          title={recording ? "Stop and put it in the box" : "Hold the floor"}
        >
          {recording ? "■" : "●"}
        </button>
        <textarea
          rows={1}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Ask the ${role.toLowerCase()}…`}
          className="min-h-[42px] flex-1 resize-none rounded-[6px] border border-edge bg-ground px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-edge-bright focus:outline-none"
        />
        <button
          type="submit"
          disabled={!typed.trim()}
          className="shrink-0 rounded-[6px] bg-accent px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110 disabled:bg-edge disabled:text-faint"
        >
          Ask
        </button>
      </form>
    </motion.section>
  );
}

/** Speaks an agent line in that agent's voice. Resolves either way. */
export async function sayAs(seatId: string, text: string, tier: VoiceTier) {
  try {
    await speak(text, voiceFor(seatId), tier);
  } catch {
    /* a dead voice must not stall the room */
  }
}
