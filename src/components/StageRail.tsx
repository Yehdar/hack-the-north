"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/Logo";

// ============================================================================
// THE STAGE RAIL.
//
// The single thing that turns a pile of panels into a walkthrough. Anyone who
// walks up mid-demo can see where they are, what has already happened, and
// what is coming. Without anyone narrating it.
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
  { id: "intake", part: 1, name: "Product", blurb: "What you built, in your own words." },
  { id: "split", part: 1, name: "Problem", blurb: "The problem your product implies." },
  { id: "deploy", part: 1, name: "Sample", blurb: "Who gets asked, and where they work." },
  { id: "listen", part: 1, name: "Responses", blurb: "Which problem each of them has." },
  { id: "reveal", part: 1, name: "Result", blurb: "What the market's answer means." },
  { id: "council", part: 1, name: "Council", blurb: "Five analysts assess one city." },
  { id: "score", part: 1, name: "Validation", blurb: "Whether the problem is big enough." },
  { id: "pitch", part: 2, name: "Committee", blurb: "Defend it to a firm's partners." },
];

/** Click the name to rename. Enter saves, Escape abandons. */
function ProjectName({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        title="Rename this project"
        className="group flex w-full items-baseline gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[14px] leading-tight text-ink">
          {name || "Untitled project"}
        </span>
        <span className="label shrink-0 opacity-0 transition group-hover:opacity-100">
          save as
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRename(draft.trim() || name);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onRename(draft.trim() || name);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-[3px] border border-edge-bright bg-ground px-2 py-1 text-[14px] text-ink focus:outline-none"
      />
    </form>
  );
}

export function StageRail({
  state,
  solution,
  rerun,
  under,
  onReset,
  projectName,
  onRename,
  onJump,
}: {
  state: Record<StageId, StageState>;
  /** The pitch being tested, kept beside the steps it is being put through. */
  solution?: string;
  rerun?: boolean;
  /** Anything that belongs with the solution, such as the problems it could
   *  be sold against. */
  under?: React.ReactNode;
  /** Start again with a different product. */
  onReset?: () => void;
  /** What this project is called, and how to rename it. Omit to hide. */
  projectName?: string;
  onRename?: (name: string) => void;
  onJump?: (id: StageId) => void;
}) {
  return (
    <nav className="flex h-full w-[248px] shrink-0 flex-col border-r border-edge bg-surface/40">
      <div className="px-4 pb-3 pt-4">
        <Wordmark size={18} />
        <p className="label mt-1">see it · defend it</p>
      </div>

      {solution && (
        <>
          <div className="rule mx-4" />
          <div className="px-4 py-2.5">
            {/* The project's name, editable in place. "Save as" wants to be
                where the name already is, not behind a menu somewhere else. */}
            {onRename && (
              <ProjectName name={projectName ?? ""} onRename={onRename} />
            )}

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <p className="label" style={rerun ? { color: "var(--accent)" } : undefined}>
                {rerun ? "Solution · rewritten" : "Solution"}
              </p>
              {onReset && (
                <button
                  onClick={onReset}
                  title="Start again with a different product"
                  className="label underline-offset-4 hover:text-ink hover:underline"
                >
                  Change
                </button>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink/85">&ldquo;{solution}&rdquo;</p>
            {under && <div className="mt-2.5">{under}</div>}
          </div>
        </>
      )}

      <div className="rule mx-4" />

      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {STAGES.map((stage, i) => {
          const s = state[stage.id];
          const prev = i > 0 ? STAGES[i - 1] : null;
          const partBreak = prev && prev.part !== stage.part;

          return (
            <li key={stage.id}>
              {/* The two halves are separated by a rule, not announced. */}
              {partBreak && <div className="my-2 h-px bg-edge" />}

              <button
                disabled={!onJump || s === "todo"}
                onClick={() => onJump?.(stage.id)}
                className={`group relative flex w-full gap-3 rounded-[3px] px-2 py-2 text-left transition ${
                  s === "active" ? "bg-surface-2" : "hover:bg-surface-2/60"
                } ${s === "todo" ? "cursor-default" : ""}`}
              >
                {/* spine */}
                <span className="relative flex w-5 shrink-0 justify-center">
                  {i < STAGES.length - 1 && (
                    <span
                      className="absolute left-1/2 top-5 h-[calc(100%+14px)] w-px -translate-x-1/2"
                      style={{ background: s === "done" ? "var(--accent)" : "var(--border)" }}
                    />
                  )}
                  {/* Numbered, not ticked. A tick says "finished" but not
                      "finished what, out of how many". And the step counter it
                      replaces used to duplicate this in the middle of the
                      screen. The number stays visible in every state so the
                      rail reads as a list of steps at a glance. */}
                  <span
                    className="relative z-10 mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border font-mono text-[11px] font-semibold tabular-nums"
                    style={{
                      borderColor: s === "todo" ? "var(--border)" : "var(--accent)",
                      background: s === "done" ? "var(--accent)" : "var(--ground)",
                      color:
                        s === "done"
                          ? "var(--ground)"
                          : s === "active"
                            ? "var(--accent)"
                            : "var(--faint)",
                    }}
                  >
                    {i + 1}
                    {s === "active" && (
                      <motion.span
                        className="absolute inset-0 rounded-full border"
                        style={{ borderColor: "var(--accent)" }}
                        animate={{ opacity: [1, 0.2, 1], scale: [1, 1.25, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                      />
                    )}
                  </span>
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[15px] leading-tight ${
                      s === "todo" ? "text-faint" : s === "active" ? "text-accent" : "text-ink/85"
                    }`}
                  >
                    {stage.name}
                  </span>
                  <span
                    className={`mt-1 block text-[12px] leading-snug ${
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
        href="/"
        className="label mx-4 mt-3 flex items-center justify-between transition hover:text-ink"
      >
        <span>← All projects</span>
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
