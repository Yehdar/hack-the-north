"use client";

import { motion } from "framer-motion";
import { SessionDiff } from "@/components/SessionDiff";
import { BlurWords } from "@/components/BlurWords";
import { NumberTicker } from "@/components/NumberTicker";
import type { Assessment, NoMarket } from "@/lib/advice";
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
  /** Null when nobody claimed any of the problems, which is its own outcome. */
  market: ProblemStatement | null;
  /** Why nobody has it, when nobody does. */
  noMarket?: NoMarket | null;
  aligned: boolean;
  votes: CrowdVerdict["problemVotes"];
  /** Against the run this one came from. Null on a first run. */
  delta: SessionDelta[] | null;
  crowd: number;
  problemCount: number;
  city: string | null;
  /** What the run means, in words. The numbers below are its evidence. */
  advice?: Assessment | null;
  refining: boolean;
  onAccept: () => void;
  onRefine: () => void;
  onClose: () => void;
  /** Carry on to the committee when there is no market problem to carry. */
  onAnyway?: () => void;
};

/** A fragment reads badly mid sentence with a capital on the front. */
function lower(t: string): string {
  const s = t.trim();
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

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
  noMarket,
  aligned,
  votes,
  delta,
  crowd,
  problemCount,
  city,
  advice,
  refining,
  onAccept,
  onRefine,
  onClose,
  onAnyway,
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
        <p className="label" style={{ color: market ? "var(--accent)" : "var(--stop)" }}>
          {!market
            ? "Nobody we asked has this problem"
            : aligned
              ? "Run two · the market agrees with you now"
              : delta
                ? "Run two · the market still disagrees"
                : "The market disagrees with you"}
        </p>

        {/* Nobody claimed a problem. Not a blank screen and not a failure
            state: say which of the three it is, and what to do about it. */}
        {!market && noMarket ? (
          <div className="mt-5">
            <p className="headline text-[30px] leading-tight">
              <BlurWords text={noMarket.headline} delay={200} />
            </p>
            <p className="mt-4 text-sm leading-relaxed">{noMarket.evidence}</p>
            {noMarket.instead && (
              <p className="insert-muted mt-3 text-sm leading-relaxed">
                What they do instead: {noMarket.instead} That is what you are up against.
              </p>
            )}
            <p className="mt-4 text-sm leading-relaxed">
              <span className="label">Do this next</span> {noMarket.action}
            </p>
            <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--insert-2)" }}>
              <p className="label">You pitched</p>
              <p className="insert-muted mt-1 text-sm leading-relaxed">{pitched.statement}</p>
            </div>
          </div>
        ) : !market ? null : aligned ? (
          <div className="mt-5">
            <p className="label">You pitched, and they have</p>
            <p className="headline mt-2 text-[32px]">
              <BlurWords text={market.statement} delay={250} />
            </p>
            <p className="insert-muted blur-word mt-3 text-xs" style={{ animationDelay: "900ms" }}>
              Felt by {lower(market.whoHasIt)}
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
                Felt by {lower(market.whoHasIt)}
              </p>
            </div>
          </>
        )}

        {/* A founder cannot act on "47 out of 100". They can act on a
            sentence. The numbers underneath are what it rests on. */}
        {advice && market && (
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--insert-2)" }}>
            <p className="text-[17px] leading-snug">{advice.callToAction}</p>
            <p className="insert-muted mt-2 text-[12px] leading-relaxed">
              <span className="label">Do this next</span> {advice.nextStep}
            </p>
          </div>
        )}

        <div
          className={`mt-6 grid grid-cols-3 gap-4 pt-4 ${market ? "" : "hidden"}`}
          style={{ borderTop: "1px solid var(--insert-2)" }}
        >
          {/* Plain words, not field names. "p2 · theirs / 57 / sev 67 · 86%"
              is readable only to whoever wrote the schema. */}
          {votes.slice(0, 3).map((v, i) => (
            <div key={v.problemId}>
              <p className="label">
                {v.problemId === pitched.id
                  ? "The one you pitched"
                  : v.problemId === market?.id && !aligned
                    ? "The one they have"
                    : "Real-world problems"}
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

        {market && !aligned && (
          <p className="insert-muted mt-3 text-[11px] leading-relaxed">
            Theirs wins on weight, not headcount: how badly it hurts the people who have it, and how
            many of those would pay.
          </p>
        )}

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
          {market && (
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
          )}

          {!aligned && (
            <button
              onClick={onRefine}
              disabled={refining}
              className="border border-insert-ink/25 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:border-insert-ink/60 disabled:opacity-50"
            >
              {refining ? "Rewriting…" : market ? "Re-pitch it their way, ask again" : "Rewrite it and ask again"}
            </button>
          )}

          <button
            onClick={!market && onAnyway ? onAnyway : onClose}
            className="insert-muted px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:opacity-70"
          >
            {!market ? "Take it to the committee anyway" : aligned ? "Close" : "Keep my framing"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
