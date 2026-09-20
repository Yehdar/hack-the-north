"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSessions } from "@/lib/sessions";

// ============================================================================
// SAVING.
//
// Everything saves itself, to this browser, the moment it changes. Nobody was
// told that, so there was no way to know whether closing the tab would lose
// the run. This says so, and only when there is something to say.
//
// It watches the session record rather than taking a prop, because the writes
// come from half a dozen places (the crowd landing, the score, the committee,
// a rename) and threading a flag through all of them would be worse than
// noticing the change here.
// ============================================================================

export function SaveState({ className }: { className?: string }) {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);

  const active = sessions.find((s) => s.id === activeId);
  const stamp = active?.updatedAt ?? 0;

  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const seen = useRef(stamp);

  useEffect(() => {
    if (!stamp || stamp === seen.current) return;
    seen.current = stamp;

    setState("saving");
    // Long enough to read, short enough not to lie about how long it took.
    const toSaved = setTimeout(() => setState("saved"), 420);
    const toIdle = setTimeout(() => setState("idle"), 2600);
    return () => {
      clearTimeout(toSaved);
      clearTimeout(toIdle);
    };
  }, [stamp]);

  if (!active) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <AnimatePresence mode="wait">
        {state !== "idle" ? (
          <motion.span
            key={state}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="label flex items-center gap-1.5"
            style={{ color: state === "saved" ? "var(--go)" : "var(--muted)" }}
          >
            {state === "saving" ? (
              <motion.span
                className="inline-block h-2 w-2 rounded-full border"
                style={{ borderColor: "var(--muted)", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <span aria-hidden>✓</span>
            )}
            {state === "saving" ? "Saving" : "Saved"}
          </motion.span>
        ) : (
          <motion.span
            key="rest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="label"
            title="Everything is kept in this browser as you go"
          >
            Saved to this browser
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
