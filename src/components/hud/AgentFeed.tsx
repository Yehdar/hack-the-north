"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

// Top-right. Every agent utterance springs in and stacks, newest on top.
// This is the thing that makes a multi-agent system *feel* like many agents
// rather than one slow request.

export type FeedItem = {
  id: string;
  agent: string;
  message: string;
  kind: "finding" | "challenge" | "rebuttal" | "concession";
};

const ACCENT: Record<FeedItem["kind"], string> = {
  finding: "bg-ink",
  challenge: "bg-accent",
  rebuttal: "bg-muted",
  concession: "bg-positive",
};

export function AgentFeed({
  items,
  onDismiss,
  ttlMs = 9000,
  top = "top-8",
}: {
  items: FeedItem[];
  onDismiss: (id: string) => void;
  ttlMs?: number;
  /** Tailwind top offset, for pages with a bar across the top. */
  top?: string;
}) {
  // Cards expire on their own. Without this they pile up on top of each other
  // and the stack becomes an unreadable smear — which is exactly what it did
  // the first time this ran.
  const newest = items[0]?.id;
  useEffect(() => {
    if (!newest) return;
    const t = setTimeout(() => onDismiss(items[items.length - 1].id), ttlMs);
    return () => clearTimeout(t);
  }, [newest, items, onDismiss, ttlMs]);

  return (
    <div className={`pointer-events-none absolute right-8 z-50 w-80 ${top}`}>
      <AnimatePresence>
        {items.map((item, index) => {
          // Newest is index 0 and sits on top; older cards sink and shrink.
          const depth = items.length - 1 - index;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 100, scale: 0.8, y: -20 }}
              animate={{
                opacity: depth === 0 ? 1 : 0.55 - depth * 0.12,
                x: depth * 5,
                // Real card height, so the newest is fully legible and the
                // ones behind read as a receding deck rather than overlap.
                y: depth * 86,
                scale: 1 - depth * 0.03,
              }}
              exit={{ opacity: 0, x: 100, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{ zIndex: 50 + index }}
              className="panel panel-bright pointer-events-auto absolute right-0 top-0 w-80 p-3 shadow-xl"
            >
              <div className="flex items-start gap-2">
                <div className={`mt-1.5 h-2 w-2 flex-shrink-0 ${ACCENT[item.kind]}`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider text-ink">
                      {item.agent}
                    </span>
                    <button
                      onClick={() => onDismiss(item.id)}
                      aria-label="Dismiss"
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center bg-surface-2 transition-colors hover:bg-edge-bright"
                    >
                      <X className="h-2.5 w-2.5 text-muted" />
                    </button>
                  </div>
                  <p className="line-clamp-3 break-words text-xs leading-relaxed text-ink/80">
                    {item.message}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
