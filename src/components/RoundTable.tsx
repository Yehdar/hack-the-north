"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AgentFace, moodOf } from "@/components/AgentFace";

// ============================================================================
// THE ROUND TABLE.
//
// Part two used to happen over a globe, which was left over from part one and
// meant nothing here: an investment committee does not sit on a map. Five
// partners sit around a table instead, and the room is the screen.
//
// Everything that moves is bound to something real. The speaker's chair lifts
// and lights, the person being addressed turns toward them, a chair dims while
// its partner is thinking. Nothing animates to look busy.
// ============================================================================

export type Seat = {
  id: string;
  role: string;
  /** -1..1 once they have a view. Undefined before they speak. */
  stance?: number;
  /** Their share of the vote, which sets how large they sit. */
  weight: number;
};

export type TableProps = {
  seats: Seat[];
  /** Who is speaking right now. */
  speaking?: string | null;
  /** Who that person is speaking to, when it is one of the others. */
  addressing?: string | null;
  /** Seats still forming a view. */
  thinking?: Set<string>;
  /** Seats that changed their mind. */
  conceded?: Set<string>;
  /** The seat the founder has opened a conversation with. */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** Pushed aside to make room for the conversation panel. */
  shifted?: boolean;
};

/** Seat n of m, clockwise from the far side, so the chair faces the viewer. */
function seatAt(i: number, n: number) {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return {
    // A wide, shallow ellipse: a table seen from across the room rather than
    // from directly above, which would read as a pie chart.
    x: 50 + Math.cos(a) * 34,
    y: 50 + Math.sin(a) * 27,
    // Nearer the bottom means nearer the viewer, so bigger and in front.
    depth: (Math.sin(a) + 1) / 2,
  };
}

export function RoundTable({
  seats,
  speaking,
  addressing,
  thinking,
  conceded,
  selected,
  onSelect,
  shifted,
}: TableProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={{ scale: shifted ? 0.86 : 1, x: shifted ? "-6%" : 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 22 }}
    >
      {/* the table */}
      <div className="absolute left-1/2 top-1/2 h-[46%] w-[62%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="h-full w-full rounded-[50%] border"
          style={{
            borderColor: "var(--border-bright)",
            background:
              "radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--surface-2) 92%, transparent), var(--surface) 70%)",
            boxShadow: "0 40px 80px -40px rgb(0 0 0 / 0.85)",
          }}
        />
        {/* the report on the table, which is what they are all here about */}
        <div
          className="absolute left-1/2 top-1/2 h-[26%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[2px]"
          style={{ background: "var(--insert)", opacity: 0.9, transform: "translate(-50%,-50%) rotate(-7deg)" }}
        />
      </div>

      {seats.map((s, i) => {
        const p = seatAt(i, seats.length);
        const isSpeaking = speaking === s.id;
        const isAddressed = addressing === s.id;
        const dimmed = Boolean(selected) && selected !== s.id;

        // Turn toward whoever is being addressed, or toward the speaker.
        const look = (() => {
          const other = isSpeaking ? addressing : speaking;
          if (!other || other === s.id) return 0;
          const j = seats.findIndex((x) => x.id === other);
          if (j < 0) return 0;
          return Math.sign(seatAt(j, seats.length).x - p.x);
        })();

        const size = 74 + s.weight * 46 + p.depth * 14;

        return (
          <motion.button
            key={s.id}
            onClick={() => onSelect?.(selected === s.id ? null : s.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[10px] p-2 text-center transition-colors"
            style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: Math.round(p.depth * 10) + 1 }}
            animate={{
              y: isSpeaking ? -8 : 0,
              scale: selected === s.id ? 1.08 : 1,
              opacity: dimmed ? 0.35 : 1,
            }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            title={`${s.role} · click to talk to them`}
          >
            <AgentFace
              mood={moodOf(s.stance)}
              speaking={isSpeaking}
              thinking={thinking?.has(s.id) && s.stance === undefined}
              conceded={conceded?.has(s.id)}
              gaze={look}
              size={size}
            />

            <p
              className="mt-1 whitespace-nowrap text-[13px] leading-tight"
              style={{
                color: isSpeaking
                  ? "var(--accent)"
                  : isAddressed
                    ? "var(--ink)"
                    : "var(--muted)",
              }}
            >
              {s.role}
            </p>

            {/* being spoken to is worth showing: it is what makes the room
                read as a conversation rather than five monologues */}
            <AnimatePresence>
              {isAddressed && !isSpeaking && (
                <motion.span
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="label mt-0.5 block"
                  style={{ color: "var(--accent)" }}
                >
                  being asked
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

export type SubtitleLine = { id: string; speaker: string; text: string };

/**
 * What has been said, under the table. Used to be one line, replaced the
 * moment the next arrived, so anyone who looked away for a sentence lost it
 * for good. It is a scrolling caption log now: everything said stays
 * reachable, and it follows the newest line down unless you scroll up to
 * read back, the way a video call's own captions do.
 */
export function Subtitles({
  lines,
  paused,
}: {
  lines: SubtitleLine[];
  paused?: boolean;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const last = lines[lines.length - 1];

  // Follow the conversation down, but only if the viewer was already at the
  // bottom. Scrolling up to reread should not get yanked back to now.
  useEffect(() => {
    const el = feed.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="pointer-events-none flex w-full justify-center">
      <AnimatePresence>
        {lines.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="panel panel-bright pointer-events-auto w-full max-w-2xl px-4 py-3"
          >
            {last && (
              <p className="label text-center" style={{ color: "var(--accent)" }}>
                {last.speaker}
                {paused && " · paused"}
              </p>
            )}
            <div
              ref={feed}
              className="mt-1 max-h-32 space-y-1.5 overflow-y-auto text-center"
            >
              {lines.map((l, i) => (
                <p
                  key={l.id}
                  className="text-[17px] leading-snug text-ink transition-opacity"
                  style={{ opacity: i === lines.length - 1 ? 1 : 0.45 }}
                >
                  {l.text}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
