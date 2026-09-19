"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useVenture } from "@/lib/store";

// The founder's own words are the only required input. Everything else —
// problems, hub findings, the pitch, the verdict — accretes onto this.

const EXAMPLES = [
  "An AI tool that plugs into your repo and writes unit tests for untested code.",
  "A marketplace connecting retired tradespeople with apprentices.",
  "Software that reconciles invoices across three ERPs automatically.",
];

export function Intake({ onDone }: { onDone: () => void }) {
  const start = useVenture((s) => s.start);
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    start(text);
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl px-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
          Step one
        </p>
        <h2 className="mt-2 font-mono text-2xl text-white">What have you built?</h2>
        <p className="mt-2 font-mono text-xs leading-relaxed text-white/50">
          Describe the solution, not the problem. Working out which problem it
          actually solves is this system&apos;s job, and it is often not the one
          you think.
        </p>

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={4}
          placeholder="We built…"
          className="mt-5 w-full resize-none border border-white/25 bg-black p-4 font-mono text-sm text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="border border-white/15 px-2 py-1 text-left font-mono text-[10px] text-white/40 transition hover:border-white/40 hover:text-white/70"
            >
              {ex.slice(0, 44)}…
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="bg-white px-5 py-2 font-mono text-xs uppercase tracking-widest text-black transition hover:bg-white/80 disabled:bg-white/20 disabled:text-white/40"
          >
            Take it to the committee
          </button>
          <span className="font-mono text-[10px] text-white/30">⌘↵</span>
        </div>
      </div>
    </motion.div>
  );
}
