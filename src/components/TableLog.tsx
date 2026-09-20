"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Lean } from "@/lib/lean";
import { LEAN_TONE } from "@/lib/lean";

// ============================================================================
// THE RIGHT-HAND COLUMN.
//
// Where the room stands, what it has said, and what each conversation changed.
//
// The lean is a lean and not a score on purpose. A number implies a precision
// the room does not have, and it invites a founder to optimise a figure
// instead of listening to the argument underneath it.
// ============================================================================

export type LogLine = {
  id: string;
  from: string;
  to?: string;
  text: string;
  kind: "finding" | "challenge" | "rebuttal" | "concession" | "chair";
};

const KIND_COLOR: Record<LogLine["kind"], string> = {
  finding: "var(--border-bright)",
  challenge: "var(--caution)",
  rebuttal: "var(--cold)",
  concession: "var(--go)",
  chair: "var(--accent)",
};

export function CommitteeLean({ lean, moved }: { lean: Lean; moved?: boolean }) {
  const tone = LEAN_TONE[lean];

  return (
    <div className="border-b border-edge p-4">
      <p className="label">Committee opinion</p>
      <div className="mt-2 flex items-center gap-2.5">
        <motion.span
          key={lean}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: tone.color, boxShadow: `0 0 12px -1px ${tone.color}` }}
        />
        <motion.p
          key={`${lean}-t`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[15px] leading-tight"
          style={{ color: tone.color }}
        >
          {tone.label}
        </motion.p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{tone.note}</p>

      <AnimatePresence>
        {moved && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="label mt-2 overflow-hidden"
            style={{ color: "var(--accent)" }}
          >
            that conversation moved the room
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TableLog({
  lines,
  summaries,
  direction,
}: {
  lines: LogLine[];
  /** One line per conversation the founder has had. */
  summaries: { id: string; role: string; text: string }[];
  /** What the room is doing right now, in a phrase. */
  direction?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {direction && (
        <div className="border-b border-edge px-4 py-3">
          <p className="label">Right now</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink/85">{direction}</p>
        </div>
      )}

      {summaries.length > 0 && (
        <div className="border-b border-edge p-4">
          <p className="label">What your conversations changed</p>
          <ul className="mt-2 space-y-2">
            {summaries.map((s) => (
              <li key={s.id} className="border-l-2 border-accent/50 pl-2.5">
                <p className="label">{s.role}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink/80">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="label">The meeting</p>
        <div className="mt-2 space-y-2.5">
          {lines.length === 0 && (
            <p className="text-[11px] leading-relaxed text-faint">
              Nothing said yet. The chair opens by putting the report on the table.
            </p>
          )}
          {lines.map((l) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="border-l-2 pl-2.5"
              style={{ borderColor: KIND_COLOR[l.kind] }}
            >
              <p className="label">
                {l.from}
                {l.to && l.to !== "room" ? ` → ${l.to}` : ""}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink/75">{l.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
