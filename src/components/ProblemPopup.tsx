"use client";

import { motion } from "framer-motion";
import { ProcessingPanel } from "@/components/hud/ProcessingPanel";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// STEP TWO, AS A POP-UP.
//
// Reading the pitch takes a moment, so the founder watches it happen: the
// progress first, then their own solution and the real world problems it could
// be sold against, scrollable. Close it
// and the list moves to the corner of the globe, where it stays reachable
// without being in the way.
// ============================================================================

export function ProblemPopup({
  loading,
  progress,
  provider,
  solution,
  others,
  onClose,
}: {
  loading: boolean;
  progress: { step: string; unit: string; done: number; total: number };
  provider?: string;
  /** The founder's own words for what they built. */
  solution?: string;
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
        <ProcessingPanel
          step={progress.step}
          done={progress.done}
          total={progress.total}
          unit={progress.unit}
          round={provider ? `provider ${provider}` : undefined}
        />

        {solution && (
          <div className="mt-5 border-t border-edge pt-4">
            <p className="label">The solution:</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{solution}</p>
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-4 flex min-h-0 flex-col border-t border-edge pt-4">
            <p className="label">Real world problems that could use your solution</p>
            <ul className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {others.map((p) => (
                <li key={p.id} className="border-l-2 border-edge pl-3">
                  <p className="text-[12px] leading-relaxed text-ink/90">{p.statement}</p>
                  {p.whoHasIt && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">Felt by {lower(p.whoHasIt)}</p>
                  )}
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

function lower(t: string): string {
  const s = t.trim().replace(/[.]$/, "");
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
