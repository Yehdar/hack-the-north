"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/Logo";

// ============================================================================
// THE STAGE RAIL.
//
// The single thing that turns a pile of panels into a walkthrough. Anyone who
// walks up mid-demo can see where they are, what has already happened, and
// what is coming — without anyone narrating it.
//
// Each stage carries a one-line "what this is for", because a progress bar
// that only shows position teaches nothing. The rail explains the product while
// the product runs.
// ============================================================================

export type StageId =
  | "intake"
  | "split"
  | "deploy"
  | "listen"
  | "reveal"
  | "council"
  | "score"
  | "pitch";

export type StageState = "todo" | "active" | "done";

const STAGES: { id: StageId; part: 1 | 2; name: string; blurb: string }[] = [
  { id: "intake", part: 1, name: "The product", blurb: "What you built, in your words." },
  { id: "split", part: 1, name: "Problem split", blurb: "Every problem this could be solving." },
  { id: "deploy", part: 1, name: "Deploy", blurb: "Who in the world should see it." },
  { id: "listen", part: 1, name: "Listen", blurb: "Which problem do they actually have." },
  { id: "reveal", part: 1, name: "The reveal", blurb: "Yours against theirs." },
  { id: "council", part: 1, name: "Hub council", blurb: "Five agents argue about one city." },
  { id: "score", part: 1, name: "Validation", blurb: "Is the problem big enough." },
  { id: "pitch", part: 2, name: "The committee", blurb: "Defend it to investors, out loud." },
];

export function StageRail({
  state,
  onJump,
}: {
  state: Record<StageId, StageState>;
  onJump?: (id: StageId) => void;
}) {
  return (
    <nav className="flex h-full w-[212px] shrink-0 flex-col border-r border-edge bg-surface/40">
      <div className="p-4">
        <Wordmark size={18} />
        <p className="label mt-1">see it · defend it</p>
      </div>

      <div className="rule mx-4" />

      <ol className="flex-1 overflow-y-auto p-3">
        {STAGES.map((stage, i) => {
          const s = state[stage.id];
          const prev = i > 0 ? STAGES[i - 1] : null;
          const partBreak = prev && prev.part !== stage.part;

          return (
            <li key={stage.id}>
              {partBreak && (
                <div className="my-3 flex items-center gap-2 px-1">
                  <span className="label">Part two</span>
                  <span className="h-px flex-1 bg-edge" />
                </div>
              )}
              {i === 0 && (
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="label">Part one</span>
                  <span className="h-px flex-1 bg-edge" />
                </div>
              )}

              <button
                disabled={!onJump || s === "todo"}
                onClick={() => onJump?.(stage.id)}
                className={`group relative flex w-full gap-2.5 rounded-[3px] px-2 py-2 text-left transition ${
                  s === "active" ? "bg-surface-2" : "hover:bg-surface-2/60"
                } ${s === "todo" ? "cursor-default" : ""}`}
              >
                {/* spine */}
                <span className="relative flex w-4 shrink-0 justify-center">
                  {i < STAGES.length - 1 && (
                    <span
                      className="absolute left-1/2 top-4 h-[calc(100%+12px)] w-px -translate-x-1/2"
                      style={{ background: s === "done" ? "var(--accent)" : "var(--border)" }}
                    />
                  )}
                  <span
                    className="relative z-10 mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px]"
                    style={{
                      borderColor:
                        s === "todo" ? "var(--border)" : "var(--accent)",
                      background:
                        s === "done"
                          ? "var(--accent)"
                          : s === "active"
                            ? "transparent"
                            : "var(--ground)",
                      color: "var(--ground)",
                    }}
                  >
                    {s === "done" && "✓"}
                    {s === "active" && (
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                        animate={{ opacity: [1, 0.25, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                    )}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[11px] leading-tight ${
                      s === "todo" ? "text-faint" : s === "active" ? "text-accent" : "text-ink/85"
                    }`}
                  >
                    {stage.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] leading-snug ${
                      s === "active" ? "text-muted" : "text-faint"
                    }`}
                  >
                    {stage.blurb}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rule mx-4" />
      <Link
        href="/dashboard"
        className="label mx-4 mt-3 flex items-center justify-between transition hover:text-ink"
      >
        <span>Saved runs</span>
        <span aria-hidden>→</span>
      </Link>
      <p className="p-4 text-[9px] leading-relaxed text-faint">
        AI simulation. Not affiliated with or endorsed by any firm named here.
      </p>
    </nav>
  );
}

/** Where the founder is in Part 1. Each segment plays, then waits for them. */
export type Segment =
  | "idle"
  | "split"
  | "deploy"
  | "listen"
  | "heard"
  | "result"
  | "council"
  | "deliberated"
  | "scored";

const ORDER: Segment[] = [
  "idle",
  "split",
  "deploy",
  "listen",
  "heard",
  "result",
  "council",
  "deliberated",
  "scored",
];

/** Derives rail state from the segment on screen, so it can never claim
 *  progress the founder has not actually been shown. */
export function deriveStages(segment: Segment, hasIdea: boolean): Record<StageId, StageState> {
  const at = ORDER.indexOf(segment);
  const stage = (active: Segment[], last: Segment): StageState =>
    active.includes(segment) ? "active" : at > ORDER.indexOf(last) ? "done" : "todo";

  return {
    intake: hasIdea ? "done" : "active",
    split: stage(["split"], "split"),
    deploy: stage(["deploy"], "deploy"),
    listen: stage(["listen", "heard"], "heard"),
    reveal: stage(["result"], "result"),
    council: stage(["council", "deliberated"], "deliberated"),
    score: segment === "scored" ? "done" : "todo",
    pitch: segment === "scored" ? "active" : "todo",
  };
}
