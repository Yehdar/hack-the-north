"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// A collapsed strip that expands into what is actually running. "How does this
// work" is the first question anyone asks about a multi-agent system, and
// answering it from the running app beats answering it from a slide.

type SystemInfo = {
  provider: string;
  models: { deep: string; fast: string };
  voice: string;
  firm: string;
  crowd: { personas: number; hubs: number; attributes: number };
  agents: { hubCouncil: number; investmentCommittee: number; total: number; roles: string[] };
  protocol: { rounds: string[] };
  demoMode: boolean;
};

export function SystemPanel() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/system")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <div className="absolute bottom-6 left-6 z-40 text-left">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="panel panel-bright mb-2 w-72 p-3 text-left"
          >
            <Row k="provider" v={info.provider} />
            <Row k="deep model" v={info.models.deep} />
            <Row k="fast model" v={info.models.fast} />
            <Row k="voice" v={info.voice} />

            <div className="my-2 h-px bg-edge" />

            <Row k="crowd" v={`${info.crowd.personas} across ${info.crowd.hubs} hubs`} />
            <Row k="attributes each" v={String(info.crowd.attributes)} />
            <Row
              k="deliberating agents"
              v={`${info.agents.total} (${info.agents.hubCouncil} + ${info.agents.investmentCommittee})`}
            />

            <div className="my-2 h-px bg-edge" />

            <p className="label mb-1">Deliberation protocol</p>
            <ol className="space-y-0.5">
              {info.protocol.rounds.map((r, i) => (
                <li key={r} className="num text-[10px] text-muted">
                  <span className="text-faint">{i}</span> {r}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              One engine. Both councils run through it.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((v) => !v)}
        className="panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
      >
        {info.demoMode && <span className="mr-2 text-accent">replay</span>}
        {info.provider} · {info.agents.total} agents · {info.crowd.personas} personas
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="label">{k}</span>
      <span className="num text-[10px] text-ink/85">{v}</span>
    </div>
  );
}
