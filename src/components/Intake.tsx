"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useVenture } from "@/lib/store";
import type { ProblemStatement } from "@/lib/types";

// The founder's own words are the only required input. Everything else —
// problems, hub findings, the pitch, the verdict — accretes onto this.

const EXAMPLES = [
  "An AI tool that plugs into your repo and writes unit tests for untested code.",
  "A marketplace connecting retired tradespeople with apprentices.",
  "Software that reconciles invoices across three ERPs automatically.",
];

// The whole product in three lines, before anyone presses anything.
const HOW = [
  { n: "01", name: "The market", line: "120 people across 20 cities tell you which problem they actually have." },
  { n: "02", name: "The council", line: "Five agents argue about whether it is worth solving, and where." },
  { n: "03", name: "The committee", line: "Pitch a real firm's partners out loud. They interrupt, then vote." },
];

type Props = {
  /** Called with the saved text. The venture file is already written by then. */
  onDone: (solution: string) => void;
  /** Closes without saving. Only offered when there is something to go back to. */
  onCancel?: () => void;
  cta?: string;
  /** Refine mode: the rewrite to start from, and the problem it now leads with. */
  refine?: { draft: string; target: ProblemStatement; crowd: number; problems: number };
};

export function Intake({ onDone, onCancel, cta = "Take it to the committee", refine }: Props) {
  const start = useVenture((s) => s.start);
  const [text, setText] = useState(refine?.draft ?? "");

  const submit = () => {
    if (!text.trim()) return;
    start(text);
    onDone(text.trim());
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
        <p className="label" style={{ color: "var(--accent)" }}>
          {refine ? "Run two · say it their way" : "Vision · step one"}
        </p>
        <h2 className="headline mt-3 text-5xl text-ink">
          {refine ? "Rewrite it around their problem." : "What have you built?"}
        </h2>

        {refine ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Same product, pointed at the problem the market actually has. Edit it — it
              is your pitch. The same {refine.crowd} people will hear it against the same{" "}
              {refine.problems} problems, so the only thing that changes between the two
              runs is how you framed it.
            </p>
            <div className="glow-accent mt-4 p-3">
              <p className="label">Leading with</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink/90">
                {refine.target.statement}
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Describe the solution, not the problem. Working out which problem it
            actually solves is this system&apos;s job — and it is often not the one
            you think.
          </p>
        )}

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape") onCancel?.();
          }}
          rows={refine ? 5 : 4}
          placeholder="We built…"
          className="mt-5 w-full resize-none border border-edge-bright bg-surface p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-faint focus:border-muted focus:outline-none"
        />

        {!refine && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="border border-edge px-2 py-1 text-left font-mono text-[10px] text-faint transition hover:border-edge-bright hover:text-muted"
              >
                {ex.slice(0, 44)}…
              </button>
            ))}
          </div>
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
              className="font-mono text-[11px] uppercase tracking-widest text-faint transition hover:text-muted"
            >
              Cancel
            </button>
          )}
          <span className="ml-auto font-mono text-[10px] text-faint">⌘↵</span>
        </div>

        {!refine && (
          <ol className="mt-10 grid gap-5 border-t border-edge pt-5 sm:grid-cols-3">
            {HOW.map((h) => (
              <li key={h.n}>
                <p className="label">
                  <span style={{ color: "var(--accent)" }}>{h.n}</span> · {h.name}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{h.line}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </motion.div>
  );
}
