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

type Check = {
  live: boolean;
  note?: string;
  tiers?: { tier: string; model: string; ok: boolean; ms: number; error?: string }[];
};

export function SystemPanel() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [open, setOpen] = useState(false);
  // One tiny call per tier against the live model, on demand — the way to
  // find out a key or a model name is wrong before the audience does.
  const [check, setCheck] = useState<Check | "running" | null>(null);

  const runCheck = () => {
    setCheck("running");
    void fetch("/api/system/check")
      .then((r) => r.json())
      .then(setCheck)
      .catch(() => setCheck({ live: true, tiers: [], note: "The check itself could not reach the server." }));
  };

  useEffect(() => {
    void fetch("/api/system")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    // Top right, opening downwards. Bottom left, the next-step bar grew into it
    // whenever it carried more than one button.
    <div className="absolute right-6 top-6 z-40 flex flex-col items-end text-left">
      <button
        onClick={() => setOpen((v) => !v)}
        className="panel px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:text-ink"
      >
        {info.demoMode && <span className="mr-2 text-accent">replay</span>}
        {info.provider} · {info.agents.total} agents · {info.crowd.personas} personas
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="panel panel-bright mt-2 w-72 p-3 text-left"
          >
            <Row k="provider" v={info.provider} />
            <Row k="deep model" v={info.models.deep} />
            <Row k="fast model" v={info.models.fast} />
            <Row k="voice" v={info.voice} />

            <button
              onClick={runCheck}
              disabled={check === "running"}
              className="label mt-1.5 underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            >
              {check === "running" ? "checking the live model…" : "check the live model"}
            </button>
            {check && check !== "running" && (
              <div className="mt-1 space-y-0.5">
                {check.note && <p className="text-[10px] leading-relaxed text-faint">{check.note}</p>}
                {check.tiers?.map((t) => (
                  <p key={t.tier} className="num text-[10px] leading-relaxed">
                    <span style={{ color: t.ok ? "var(--go)" : "var(--stop)" }}>{t.ok ? "✓" : "✗"}</span>{" "}
                    <span className="text-muted">
                      {t.tier} · {t.model} · {(t.ms / 1000).toFixed(1)}s
                    </span>
                    {t.error && <span className="block text-faint">{t.error.slice(0, 160)}</span>}
                  </p>
                ))}
              </div>
            )}

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
