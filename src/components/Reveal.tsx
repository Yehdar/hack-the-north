"use client";

import { motion } from "framer-motion";
import { SessionDiff } from "@/components/SessionDiff";
import { BlurWords } from "@/components/BlurWords";
import { NumberTicker } from "@/components/NumberTicker";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdVerdict } from "@/lib/discovery/types";
import type { SessionDelta } from "@/lib/sessions";

// ============================================================================
// THE REVEAL, the whole demo.
//
// First run: you pitched A, the market has C. From here the founder can take
// the market's problem forward, or rewrite the pitch around it and ask the
// same people again. On that second run the same card comes back with what
// moved, which is the only honest way to show a rewrite worked.
// ============================================================================

type Props = {
  pitched: ProblemStatement;
  market: ProblemStatement;
  aligned: boolean;
  votes: CrowdVerdict["problemVotes"];
  /** Against the run this one came from. Null on a first run. */
  delta: SessionDelta[] | null;
  crowd: number;
  problemCount: number;
  city: string | null;
  refining: boolean;
  onAccept: () => void;
  onRefine: () => void;
  onClose: () => void;
};

/** Severity as a word first, number second. A bare "sev 67" means nothing to
 *  someone reading it for the first time. */
function severityWord(n: number): string {
  if (n >= 75) return "badly";
  if (n >= 55) return "enough to act on";
  if (n >= 35) return "mildly";
  return "barely";
}

export function Reveal({
  pitched,
  market,
  aligned,
  votes,
  delta,
  crowd,
  problemCount,
  city,
  refining,
  onAccept,
  onRefine,
  onClose,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ground/85 py-8 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="insert beam mx-6 w-full max-w-2xl p-8"
      >
        <p className="label" style={{ color: "var(--accent)" }}>
          {aligned
            ? "Run two · the market agrees with you now"
            : delta
              ? "Run two · the market still disagrees"
              : "The market disagrees with you"}
        </p>

        {aligned ? (
          <div className="mt-5">
            <p className="label">You pitched, and they have</p>
            <p className="headline mt-2 text-[32px]">
              <BlurWords text={market.statement} delay={250} />
            </p>
            <p className="insert-muted blur-word mt-3 text-xs" style={{ animationDelay: "900ms" }}>
              Felt by {market.whoHasIt}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <p className="label">You pitched</p>
              <p className="insert-muted mt-1 text-sm leading-relaxed">
                <span className="strike">{pitched.statement}</span>
              </p>
            </div>
            <div className="mt-5">
              <p className="label blur-word" style={{ color: "var(--accent)", animationDelay: "1000ms" }}>
                The problem they actually have
              </p>
              <p className="headline mt-2 text-[32px]">
                <BlurWords text={market.statement} delay={1150} />
              </p>
              <p className="insert-muted blur-word mt-3 text-xs" style={{ animationDelay: "1900ms" }}>
                Felt by {market.whoHasIt}
              </p>
            </div>
          </>
        )}

        <div
          className="mt-6 grid grid-cols-3 gap-4 pt-4"
          style={{ borderTop: "1px solid var(--insert-2)" }}
        >
          {/* Plain words, not field names. "p2 · theirs / 57 / sev 67 · 86%"
              is readable only to whoever wrote the schema. */}
          {votes.slice(0, 3).map((v, i) => (
            <div key={v.problemId}>
              <p className="label">
                {v.problemId === pitched.id
                  ? "The one you pitched"
                  : v.problemId === market.id && !aligned
                    ? "The one they have"
                    : "Also raised"}
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl">
                  <NumberTicker value={v.votes} delay={aligned ? 300 : 1400 + i * 120} />
                </span>
                <span className="insert-muted text-[11px]">
                  {v.votes === 1 ? "person" : "people"}
                </span>
              </p>
              <p className="insert-muted mt-1 text-[10px] leading-relaxed">
                {(v.payRate * 100).toFixed(0)}% of them would pay to fix it
                <br />
                hurts {severityWord(v.meanSeverity)} ({v.meanSeverity.toFixed(0)} out of 100)
              </p>
            </div>
          ))}
        </div>

        {delta && (
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--insert-2)" }}>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <p className="label">Against your first run</p>
              <p className="insert-muted text-[10px]">
                same {crowd} people · same {problemCount} problems · only the pitch changed
              </p>
            </div>
            <SessionDiff deltas={delta} onInsert />
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onAccept}
            className="bg-accent px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
          >
            {/* Say what pressing it does, not which field it sets. */}
            {city
              ? aligned
                ? `Study this problem in ${city}`
                : `Use their problem, and study it in ${city}`
              : "Use their problem from here on"}
          </button>

          {!aligned && (
            <button
              onClick={onRefine}
              disabled={refining}
              className="border border-insert-ink/25 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:border-insert-ink/60 disabled:opacity-50"
            >
              {refining ? "Rewriting…" : "Re-pitch it their way, ask again"}
            </button>
          )}

          <button
            onClick={onClose}
            className="insert-muted px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:opacity-70"
          >
            {aligned ? "Close" : "Keep my framing"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
