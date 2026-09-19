"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// Boot sequence. Buys the pre-read call its latency back by making the wait
// feel like the system coming online rather than a spinner.

const STEPS = [
  "Initializing committee",
  "Loading firm thesis and anti-portfolio",
  "Seating partners",
  "Distributing the venture file",
  "Drafting private pre-reads",
  "Committee ready",
];

export function AgentBoot({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  // Held in a ref so an inline arrow from the parent cannot restart the
  // sequence on every re-render.
  const finish = useRef(onComplete);
  finish.current = onComplete;

  useEffect(() => {
    const total = 3600;
    const startedAt = performance.now();

    // Driven off elapsed time rather than accumulated increments: setInterval
    // is not a clock, and it drifts badly whenever the main thread is busy —
    // which it is, while the globe is building its geometry.
    const tick = setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      setStep(Math.min(STEPS.length - 1, Math.floor((elapsed / total) * STEPS.length)));

      if (pct >= 100) {
        clearInterval(tick);
        setDone(true);
        setTimeout(() => finish.current(), 450);
      }
    }, 50);

    return () => clearInterval(tick);
  }, []);

  const BARS = 32;
  const filled = Math.floor((progress / 100) * BARS);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          style={{ backgroundColor: "#000" }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="mx-auto w-full max-w-md px-8">
            <div className="mb-8">
              <div className="mb-4 flex items-center gap-2 font-mono text-xs text-white/40">
                <span>Find</span>
                <span>The Problem</span>
                <span>Defend The Answer</span>
              </div>
              <h1 className="font-mono text-2xl text-white">Atlas</h1>
            </div>

            <motion.p
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 font-mono text-sm text-white/70"
            >
              {STEPS[step]}
            </motion.p>

            <div className="flex gap-0.5">
              {Array.from({ length: BARS }, (_, i) => (
                <div
                  key={i}
                  className={`h-3 flex-1 transition-colors duration-200 ${
                    i < filled ? "bg-white" : "bg-white/15"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 flex justify-between font-mono text-xs text-white/40">
              <span>{Math.round(progress)}%</span>
              <span>
                {step + 1}/{STEPS.length}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
