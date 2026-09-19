"use client";

import { motion } from "framer-motion";

// Top-left. What is happening right now, and how far through it is.

export function ProcessingPanel({
  step,
  done,
  total,
  round,
  unit = "Agent turns",
}: {
  step: string;
  done: number;
  total: number;
  round?: string;
  /** What is being counted. People answering, or agents speaking. */
  unit?: string;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const BARS = 25;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      className="panel panel-bright min-w-[280px] p-4"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.div
              key={i}
              className="h-2 w-2 bg-accent"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <span className="font-mono text-sm text-ink">{step}</span>
      </div>

      {round && <p className="label mb-2">{round}</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-muted">{unit}</span>
          <span className="num text-ink">
            {done} / {total}
          </span>
        </div>

        <div className="flex gap-0.5">
          {Array.from({ length: BARS }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-1 transition-all duration-500 ${
                i < Math.floor((pct / 100) * BARS) ? "bg-ink" : "bg-edge"
              }`}
            />
          ))}
        </div>

        <div className="num flex justify-between text-xs text-faint">
          <span>{Math.round(pct)}%</span>
          <span>{Math.max(0, total - done)} remaining</span>
        </div>
      </div>
    </motion.div>
  );
}
