"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RosterEntry = {
  id: string;
  role: string;
  weight: number;
  focus: string[];
  temperature: number;
};
type Msg = {
  id: string;
  round: number;
  from: string;
  to: string;
  kind: "finding" | "challenge" | "rebuttal" | "concession";
  text: string;
};
type Task = { id: string; question: string; assignedTo: string; why: string };
type Verdict = { agentId: string; stance: number; confidence: number; position: string };
type Metrics = {
  varianceByRound: number[];
  challenges: number;
  rebuttals: number;
  concessions: number;
  mindChanges: { agentId: string; from: number; to: number; delta: number; conceded: boolean }[];
  convergence: number;
  durationMs: number;
};

const KIND_STYLE: Record<Msg["kind"], string> = {
  finding: "border-slate-700 bg-slate-900/60",
  challenge: "border-amber-600/60 bg-amber-950/30",
  rebuttal: "border-sky-600/60 bg-sky-950/30",
  concession: "border-emerald-600/60 bg-emerald-950/30",
};

const ROUND_NAME: Record<number, string> = {
  1: "Independent · blind",
  2: "Cross-examination",
  3: "Rebuttal",
  4: "Adversarial",
};

export default function Home() {
  const [running, setRunning] = useState(false);
  const [firm, setFirm] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stances, setStances] = useState<Record<string, Verdict>>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [decision, setDecision] = useState<{ decision: string; score: number; killShot?: string; dissents: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const run = useCallback(() => {
    setRunning(true);
    setTasks([]); setMessages([]); setStances({}); setMetrics(null); setDecision(null); setError(null);

    const es = new EventSource("/api/vc/deliberate");

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      switch (ev.type) {
        case "start":
          setFirm(ev.firm.name); setProvider(ev.provider);
          setDisclaimer(ev.disclaimer); setRoster(ev.roster);
          break;
        case "task":
          setTasks((t) => [...t, ev.task]);
          break;
        case "message":
          setMessages((m) => [...m, ev.message]);
          break;
        case "verdict":
          setStances((s) => ({ ...s, [ev.verdict.agentId]: ev.verdict }));
          break;
        case "done":
          setMetrics(ev.result.metrics); setDecision(ev.verdict);
          setRunning(false); es.close();
          break;
        case "error":
          setError(ev.message); setRunning(false); es.close();
          break;
      }
    };

    es.onerror = () => { setRunning(false); es.close(); };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Investment Committee
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {firm || "Multi-agent deliberation"}
              {provider && (
                <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                  {provider}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {running ? "Deliberating…" : "Convene the committee"}
          </button>
        </header>

        {error && (
          <div className="mt-6 rounded-md border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr_300px]">
          {/* ---------------- roster + live stance ---------------- */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              The room
            </h2>
            <div className="space-y-3">
              {roster.map((a) => {
                const v = stances[a.id];
                return (
                  <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-slate-100">{a.role}</span>
                      <span className="font-mono text-xs text-slate-500">
                        {(a.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <StanceBar stance={v?.stance} confidence={v?.confidence} />
                    {v && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{v.position}</p>
                    )}
                  </div>
                );
              })}
              {roster.length === 0 && (
                <p className="text-sm text-slate-600">Press convene to begin.</p>
              )}
            </div>
          </section>

          {/* ---------------- message feed ---------------- */}
          <section className="min-w-0">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Deliberation
            </h2>
            <div
              ref={feedRef}
              className="h-[560px] space-y-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/20 p-4"
            >
              {messages.length === 0 && !running && (
                <p className="text-sm text-slate-600">
                  Nothing yet. The committee decomposes the decision, forms positions blind,
                  then challenges each other directly.
                </p>
              )}
              {messages.map((m, i) => {
                const newRound = i === 0 || messages[i - 1].round !== m.round;
                return (
                  <div key={m.id}>
                    {newRound && (
                      <div className="mb-2 mt-4 flex items-center gap-3 first:mt-0">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                          Round {m.round} · {ROUND_NAME[m.round]}
                        </span>
                        <span className="h-px flex-1 bg-slate-800" />
                      </div>
                    )}
                    <div className={`rounded-lg border p-3 ${KIND_STYLE[m.kind]}`}>
                      <div className="mb-1 flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-slate-300">{m.from}</span>
                        <span className="text-slate-600">
                          {m.to === "room" ? "→ room" : `→ ${m.to}`}
                        </span>
                        <span className="ml-auto uppercase tracking-wider text-slate-500">
                          {m.kind}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-200">{m.text}</p>
                    </div>
                  </div>
                );
              })}
              {running && (
                <p className="animate-pulse py-2 text-xs text-slate-500">thinking…</p>
              )}
            </div>
          </section>

          {/* ---------------- tasks + metrics ---------------- */}
          <section className="space-y-6">
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Assigned diligence
              </h2>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="rounded border border-slate-800 bg-slate-900/40 p-2.5">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-500">
                      {t.assignedTo}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{t.question}</p>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-xs text-slate-600">—</p>}
              </div>
            </div>

            {metrics && (
              <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Collaboration metrics
                </h2>
                <dl className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/40 p-3 font-mono text-xs">
                  <Row k="challenges" v={metrics.challenges} />
                  <Row k="rebuttals" v={metrics.rebuttals} />
                  <Row k="concessions" v={metrics.concessions} />
                  <Row k="minds changed" v={metrics.mindChanges.length} />
                  <Row
                    k="σ by round"
                    v={metrics.varianceByRound.map((x) => x.toFixed(2)).join(" → ")}
                  />
                  <Row k="convergence" v={metrics.convergence.toFixed(3)} />
                  <Row k="duration" v={`${(metrics.durationMs / 1000).toFixed(1)}s`} />
                </dl>
                {metrics.mindChanges.length > 0 && (
                  <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-emerald-500">
                      Minds changed by the argument
                    </p>
                    {metrics.mindChanges.map((c) => (
                      <p key={c.agentId} className="font-mono text-xs text-slate-300">
                        {c.agentId} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                        {c.conceded && <span className="ml-1 text-emerald-400">conceded</span>}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {decision && (
              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Verdict</p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    decision.decision === "invest"
                      ? "text-emerald-400"
                      : decision.decision === "pass"
                        ? "text-red-400"
                        : "text-amber-400"
                  }`}
                >
                  {decision.decision}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  score {decision.score.toFixed(3)}
                </p>
                {decision.dissents.length > 0 && (
                  <p className="mt-3 text-xs text-slate-400">
                    Dissenting: <span className="text-amber-400">{decision.dissents.join(", ")}</span>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {disclaimer && (
          <p className="mt-10 border-t border-slate-800 pt-4 text-[11px] text-slate-600">
            {disclaimer}
          </p>
        )}
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-200">{v}</dd>
    </div>
  );
}

/** -1 .. +1 rendered from a fixed centre, so movement between rounds is visible. */
function StanceBar({ stance, confidence }: { stance?: number; confidence?: number }) {
  if (stance === undefined) {
    return <div className="mt-2 h-1.5 rounded-full bg-slate-800" />;
  }
  const pct = Math.abs(stance) * 50;
  const positive = stance >= 0;

  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-slate-800">
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600" />
        <div
          className={`absolute top-0 h-full rounded-full ${positive ? "bg-emerald-500" : "bg-red-500"}`}
          style={{
            width: `${pct}%`,
            left: positive ? "50%" : `${50 - pct}%`,
            opacity: 0.35 + (confidence ?? 0.5) * 0.65,
          }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{stance.toFixed(2)}</span>
        <span>conf {(confidence ?? 0).toFixed(2)}</span>
      </div>
    </div>
  );
}
