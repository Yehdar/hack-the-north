"use client";

import { motion } from "framer-motion";

// Top-left. What the committee is doing right now, and how far through it is.

export function ProcessingPanel({
  step,
  done,
  total,
  round,
}: {
  step: string;
  done: number;
  total: number;
  round?: string;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const BARS = 25;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      className="min-w-[280px] border border-white/30 bg-black/90 p-4 backdrop-blur-md"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <motion.div
              key={i}
              className="h-2 w-2 bg-white"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <span className="font-mono text-sm text-white/90">{step}</span>
      </div>

      {round && (
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
          {round}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-white/60">Agent turns</span>
          <span className="text-white">
            {done} / {total}
          </span>
        </div>

        <div className="flex gap-0.5">
          {Array.from({ length: BARS }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-1 transition-all duration-500 ${
                i < Math.floor((pct / 100) * BARS) ? "bg-white" : "bg-white/20"
              }`}
            />
          ))}
        </div>

        <div className="flex justify-between font-mono text-xs text-white/50">
          <span>{Math.round(pct)}%</span>
          <span>{Math.max(0, total - done)} remaining</span>
        </div>
      </div>
    </motion.div>
  );
}
