"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useVenture } from "@/lib/store";
import { checkIdea } from "@/lib/idea";
import type { ProblemStatement } from "@/lib/types";

// The founder's own words are the only required input. Everything else —
// problems, hub findings, the pitch, the verdict, accretes onto this.

const EXAMPLE = "An AI tool that plugs into your repo and writes unit tests for untested code.";

type Props = {
  /** Called with the saved text, and the founder's own problem if they gave
   *  one. The venture file is already written by then. */
  onDone: (solution: string, problem?: string) => void;
  /** Closes without saving. Only offered when there is something to go back to. */
  onCancel?: () => void;
  cta?: string;
  /** Refine mode: the rewrite to start from, and the problem it now leads with. */
  refine?: { draft: string; target: ProblemStatement; crowd: number; problems: number };
};

export function Intake({ onDone, onCancel, cta = "Take it to the committee", refine }: Props) {
  const start = useVenture((s) => s.start);
  const [text, setText] = useState(refine?.draft ?? "");
  // Optional. If the founder already believes they know the problem, that is
  // the bet the crowd should be asked about, in their words rather than ours.
  const [problem, setProblem] = useState("");
  // Only after they try. Marking an unfinished sentence wrong while it is
  // being typed is nagging, not help.
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!text.trim()) return;
    const check = checkIdea(text);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    start(text);
    onDone(text.trim(), problem.trim() || undefined);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Above the controls, the feed and the system strip, or they float over
      // the one thing the founder is meant to be doing.
      className="absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-ground/75 py-10 backdrop-blur-[3px]"
    >
      <div className="w-full max-w-2xl px-8">
        {refine && (
          <p className="label" style={{ color: "var(--accent)" }}>
            Run two · say it their way
          </p>
        )}
        <h2 className={`headline text-5xl text-ink ${refine ? "mt-3" : ""}`}>
          {refine ? "Rewrite it around their problem." : "What's your idea?"}
        </h2>

        {refine ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Same product, pointed at the problem the market actually has. Edit it. It
              is your pitch. The same {refine.crowd} people will hear it against the same{" "}
              {refine.problems} problems, so the only thing that changes between the two
              runs is how you framed it.
            </p>
            <div className="glow-accent mt-4 p-3">
              <p className="label">Leading with</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink/90">
                {refine.target.statement}
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Describe what you made. Working out which problem it actually solves is
            this system&apos;s job, and it is often not the one you think. If you
            already believe you know the problem, say so underneath and we will test
            that instead.
          </p>
        )}

        <textarea
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          // Enter is a new line here, not send. A founder writing two sentences
          // about what they built should never have the first one submitted
          // out from under them.
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel?.();
          }}
          rows={refine ? 5 : 4}
          placeholder="We built…"
          className={`mt-5 w-full resize-none border bg-surface p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-faint focus:outline-none ${
            error ? "border-negative" : "border-edge-bright focus:border-muted"
          }`}
        />

        {error && (
          <p className="mt-2 text-xs leading-relaxed text-negative" role="alert">
            {error}
          </p>
        )}

        {!refine && (
          <>
            <div className="mt-4">
              <p className="label">
                The problem you think you&apos;re solving
                <span className="ml-2 text-faint">(optional)</span>
              </p>
              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onCancel?.();
                }}
                rows={2}
                placeholder="Leave it blank and we will work it out from your idea."
                className="mt-2 w-full resize-none border border-edge bg-surface p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-faint focus:border-muted focus:outline-none"
              />
            </div>

            <div className="mt-4">
              <p className="label">Suggestion</p>
              <button
                onClick={() => setText(EXAMPLE)}
                className="mt-2 border border-edge px-2 py-1 text-left font-mono text-[12px] text-faint transition hover:border-edge-bright hover:text-muted"
              >
                {EXAMPLE.slice(0, 44)}…
              </button>
            </div>
          </>
        )}

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={submit}
            disabled={!text.trim()}
            className={`px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition hover:brightness-110 disabled:bg-edge disabled:text-faint ${
              text.trim() ? "beam bg-accent text-ground" : "bg-accent text-ground"
            }`}
          >
            {cta}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="font-mono text-[13px] uppercase tracking-widest text-faint transition hover:text-muted"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
