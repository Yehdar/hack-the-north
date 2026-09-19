"use client";

import { motion } from "framer-motion";
import { SessionDiff } from "@/components/SessionDiff";
import { BlurWords } from "@/components/BlurWords";
import { NumberTicker } from "@/components/NumberTicker";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdVerdict } from "@/lib/discovery/types";
import type { SessionDelta } from "@/lib/sessions";

// ============================================================================
// THE REVEAL — the whole demo.
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
          {votes.slice(0, 3).map((v, i) => (
            <div key={v.problemId}>
              <p className="label">
                {v.problemId}
                {v.problemId === pitched.id && " · pitched"}
                {v.problemId === market.id && !aligned && (
                  <span style={{ color: "var(--accent)" }}> · theirs</span>
                )}
              </p>
              <p className="mt-0.5 text-2xl">
                <NumberTicker value={v.votes} delay={aligned ? 300 : 1400 + i * 120} />
              </p>
              <p className="num insert-muted text-[10px]">
                sev {v.meanSeverity.toFixed(0)} · {(v.payRate * 100).toFixed(0)}% would pay
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
            {city
              ? aligned
                ? `Convene the ${city} council`
                : `Take theirs · convene ${city}`
              : "Take their problem forward"}
          </button>

          {!aligned && (
            <button
              onClick={onRefine}
              disabled={refining}
              className="border border-insert-ink/25 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:border-insert-ink/60 disabled:opacity-50"
            >
              {refining ? "Rewriting…" : "Rewrite around it · ask again"}
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
