"use client";

import { motion } from "framer-motion";

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
        <p className="font-mono text-[13px] tracking-tight text-ink">Atlas</p>
        <p className="label mt-0.5">find it · defend it</p>
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
      <p className="p-4 text-[9px] leading-relaxed text-faint">
        AI simulation. Not affiliated with or endorsed by any firm named here.
      </p>
    </nav>
  );
}

/** Derives rail state from what has actually happened, so it can never claim
 *  progress the run has not made. */
export function deriveStages(f: {
  hasIdea: boolean;
  problems: number;
  deployed: number;
  answered: number;
  total: number;
  hasVerdict: boolean;
  councilRunning: boolean;
  councilDone: boolean;
  hasPvs: boolean;
  running: boolean;
}): Record<StageId, StageState> {
  const done = (b: boolean): StageState => (b ? "done" : "todo");

  return {
    intake: done(f.hasIdea),
    split: f.running && f.problems === 0 ? "active" : done(f.problems > 0),
    deploy: f.problems > 0 && f.deployed === 0 ? "active" : done(f.deployed > 0),
    listen:
      f.deployed > 0 && f.answered < f.total ? "active" : done(f.total > 0 && f.answered >= f.total),
    reveal: f.hasVerdict ? "done" : f.answered > 0 && f.answered >= f.total ? "active" : "todo",
    council: f.councilRunning ? "active" : done(f.councilDone),
    score: done(f.hasPvs),
    pitch: f.hasPvs ? "active" : "todo",
  };
}
