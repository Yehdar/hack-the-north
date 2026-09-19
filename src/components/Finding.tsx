"use client";

import { motion } from "framer-motion";
import type { PVSBreakdown, ProblemStatement } from "@/lib/types";

// ============================================================================
// PART ONE CLOSES HERE.
//
// Everything the market established, on one printed card, before the founder
// walks into a different room. This is the file the committee reads — showing
// it at the threshold is what makes Part 2 feel like a consequence of Part 1
// rather than a second app behind a link.
// ============================================================================

type Props = {
  pitched?: ProblemStatement;
  /** On a rewrite run, what the founder pitched before the market moved them. */
  walkedInWith?: string | null;
  chosen: ProblemStatement;
  crowd: { asked: number; engaged: number; haveIt: number; payRate: number };
  city?: { name: string; fitScore: number } | null;
  pvs?: PVSBreakdown | null;
  firmName: string;
  onEnter: () => void;
  onStay: () => void;
};

export function Finding({
  pitched,
  walkedInWith,
  chosen,
  crowd,
  city,
  pvs,
  firmName,
  onEnter,
  onStay,
}: Props) {
  const original =
    walkedInWith ?? (pitched && pitched.id !== chosen.id ? pitched.statement : null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-ground/90 py-8 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="insert beam mx-6 w-full max-w-2xl p-8"
      >
        <p className="label" style={{ color: "var(--accent)" }}>
          Part one · what the market told you
        </p>

        {original && (
          <div className="mt-5">
            <p className="label">
              You walked in with{walkedInWith && " — then rewrote your pitch around theirs"}
            </p>
            <p className="insert-muted mt-1 text-[13px] leading-relaxed line-through decoration-negative/70">
              {original}
            </p>
          </div>
        )}

        <div className="mt-5">
          <p className="label">You are taking in</p>
          <p className="headline mt-2 text-[30px]">{chosen.statement}</p>
          <p className="insert-muted mt-2 text-xs">Felt by {chosen.whoHasIt}</p>
        </div>

        <dl
          className="mt-6 grid grid-cols-4 gap-4 pt-4"
          style={{ borderTop: "1px solid var(--insert-2)" }}
        >
          <Stat k="Asked" v={String(crowd.asked)} />
          <Stat k="Full attention" v={String(crowd.engaged)} />
          <Stat k="Have this problem" v={String(crowd.haveIt)} />
          <Stat k="Of them would pay" v={`${Math.round(crowd.payRate * 100)}%`} />
        </dl>

        <div
          className="mt-5 grid grid-cols-2 gap-4 pt-4"
          style={{ borderTop: "1px solid var(--insert-2)" }}
        >
          <div>
            <p className="label">Strongest city</p>
            <p className="mt-1 text-sm">
              {city ? (
                <>
                  {city.name} <span className="num insert-muted text-xs">· fit {city.fitScore}</span>
                </>
              ) : (
                <span className="insert-muted">Not assessed</span>
              )}
            </p>
          </div>
          <div>
            <p className="label">Problem validation</p>
            {pvs ? (
              <p className="mt-1 text-sm">
                <span className="num text-lg">{pvs.total}</span>
                <span className="num insert-muted text-xs">/100 · </span>
                <span
                  className="num text-xs"
                  style={{ color: pvs.passed ? "#1d7a46" : "#b4232a" }}
                >
                  {pvs.passed ? `clears ${pvs.threshold}` : `below ${pvs.threshold} — they will be told`}
                </span>
              </p>
            ) : (
              <p className="insert-muted mt-1 text-xs leading-relaxed">
                Not scored. No council sat, and the committee will know that.
              </p>
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onEnter}
            className="bg-accent px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
          >
            Enter the committee →
          </button>
          <button
            onClick={onStay}
            className="insert-muted px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition hover:opacity-70"
          >
            Not yet
          </button>
        </div>
        <p className="insert-muted mt-4 text-[11px] leading-relaxed">
          Three partners at {firmName} read exactly this before you say a word.
        </p>
      </motion.div>
    </motion.div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="num mt-0.5 text-lg">{v}</dd>
    </div>
  );
}
