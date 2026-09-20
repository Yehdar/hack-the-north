"use client";

import { motion } from "framer-motion";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// STEP TWO, AS A POP-UP.
//
// Reading the pitch takes a moment, so the founder watches it happen: what the
// system is doing, then their own solution and the real world problems it
// could be sold against, scrollable. Close it and the list moves to the corner
// of the globe, where it stays reachable without being in the way.
//
// No bar, no percentage, no provider, no tally. This waits seconds, not
// minutes, and a founder who has just typed the thing they have been building
// for a year does not need it measured out for them. Five squares that stop
// moving when the reading is done say the same thing and take no room.
// ============================================================================

export function ProblemPopup({
  loading,
  step,
  solution,
  problem,
  others,
  onClose,
}: {
  loading: boolean;
  /** What the system is doing right now, in words. */
  step: string;
  /** The founder's own words for what they built. */
  solution?: string;
  /** The problem they said they were solving, if they said. Optional at
   *  intake, so most runs do not have one. */
  problem?: string;
  others: ProblemStatement[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-ground/70 p-6 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="panel panel-bright flex max-h-full w-[540px] max-w-full flex-col p-5"
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <motion.div
                key={i}
                className="h-2 w-2 bg-accent"
                // Still and lit once it is done, so the pop-up does not look
                // like it is still thinking after the answer is on screen.
                animate={loading ? { opacity: [0.2, 1, 0.2] } : { opacity: 1 }}
                transition={
                  loading
                    ? { duration: 1, repeat: Infinity, delay: i * 0.15 }
                    : { duration: 0.3 }
                }
              />
            ))}
          </div>
          <span className="font-mono text-sm text-ink">{step}</span>
        </div>

        {solution && (
          <div className="mt-5 border-t border-edge pt-4">
            <p className="label">The solution:</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{solution}</p>
          </div>
        )}

        {problem && (
          <div className="mt-4 border-t border-edge pt-4">
            <p className="label">The problem you said it solves:</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{problem}</p>
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-4 flex min-h-0 flex-col border-t border-edge pt-4">
            <p className="label">Real world problems that could use your solution</p>
            <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {others.map((p) => (
                <li
                  key={p.id}
                  className="group flex gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint transition-colors group-hover:bg-accent"
                  />
                  <p className="text-[12px] leading-relaxed text-ink/90 transition-colors group-hover:text-ink">
                    {p.statement}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-edge pt-4">
          <p className="text-[10px] leading-relaxed text-faint">
            {loading ? "Reading the pitch…" : "These stay with your solution, on the left, once you close this."}
          </p>
          <button
            onClick={onClose}
            disabled={loading}
            className="bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110 disabled:bg-edge disabled:text-faint"
          >
            {loading ? "Reading…" : "Close"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
