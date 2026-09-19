"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { SessionDiff } from "@/components/SessionDiff";
import { diffSessions, useSessions, type SessionSummary } from "@/lib/sessions";
import { useVenture } from "@/lib/store";
import { hubById } from "@/data/globePoints";
import { Minutes } from "@/components/Minutes";

// ============================================================================
// SAVED RUNS.
//
// A founder does not run this once. They run it, learn the market has a
// different problem, rewrite, and run it again. And the comparison between
// the two runs is worth more than either one alone. This is where that
// comparison lives.
// ============================================================================

const subscribeNothing = () => () => {};

/** False while hydrating, true after. So a returning founder never sees a
 *  flash of "no runs yet" before their saved runs load. */
function useHydrated() {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

export default function Dashboard() {
  const hydrated = useHydrated();
  const router = useRouter();
  const sessions = useSessions((s) => s.sessions);
  const remove = useSessions((s) => s.remove);
  const clear = useSessions((s) => s.clear);
  const setActive = useSessions((s) => s.setActive);
  const start = useVenture((v) => v.start);
  const [confirming, setConfirming] = useState(false);

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const rewrites = new Set(sessions.map((s) => s.parentId).filter(Boolean));

  const load = (s: SessionSummary) => {
    start(s.solution);
    // A fresh run of this idea starts its own record; nothing afterwards
    // should write into this one.
    setActive(null);
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-6">
          <div>
            <Wordmark size={18} />
            <h1 className="mt-4 font-mono text-2xl">Saved runs</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
              Every run is kept as the part a founder would compare: what you pitched, what
              the market had, how it scored, and what the committee decided. Rewrites sit
              against the run they came from.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sessions.length > 0 &&
              (confirming ? (
                <>
                  <button
                    onClick={() => {
                      clear();
                      setConfirming(false);
                    }}
                    className="border border-negative/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-negative transition hover:bg-negative/10"
                  >
                    Delete all {sessions.length}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                  >
                    Keep them
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition hover:text-ink"
                >
                  Clear all
                </button>
              ))}
            <Link
              href="/"
              className="bg-accent px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ground transition hover:brightness-110"
            >
              New run
            </Link>
          </div>
        </header>

        {hydrated && sessions.length === 0 && (
          <div className="mt-16 text-center">
            <p className="font-mono text-sm text-muted">No runs yet.</p>
            <p className="mt-2 text-xs text-faint">
              Ask the market about something you built. Every run is saved here so you can
              compare it with the next one.
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {hydrated &&
            sessions.map((s) => {
              const parent = s.parentId ? byId.get(s.parentId) : undefined;
              return (
                <RunCard
                  key={s.id}
                  run={s}
                  parent={parent}
                  parentMissing={Boolean(s.parentId && !parent)}
                  rewritten={rewrites.has(s.id)}
                  onLoad={() => load(s)}
                  onRemove={() => remove(s.id)}
                />
              );
            })}
        </div>
      </div>
    </main>
  );
}

function RunCard({
  run,
  parent,
  parentMissing,
  rewritten,
  onLoad,
  onRemove,
}: {
  run: SessionSummary;
  parent?: SessionSummary;
  parentMissing: boolean;
  rewritten: boolean;
  onLoad: () => void;
  onRemove: () => void;
}) {
  const finished = run.crowdSize > 0;
  const when = new Date(run.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className={`flex flex-col p-4 ${parent ? "glow-accent" : "panel"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label" style={parent ? { color: "var(--accent)" } : undefined}>
          {parent || parentMissing ? "Rewrite" : "Run"}
          {rewritten && " · rewritten since"}
        </p>
        <p className="num text-[10px] text-faint">{when}</p>
      </div>

      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink/90">
        &ldquo;{run.solution}&rdquo;
      </p>

      {!finished ? (
        <p className="mt-3 text-xs text-faint">This run did not finish.</p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {run.mismatch ? (
              <>
                <Line k="Pitched" v={run.pitchedProblem} struck />
                <Line k="Market has" v={run.marketProblem} accent />
              </>
            ) : (
              <Line
                k="Aligned"
                v={run.marketProblem ?? "Nobody in the crowd had any of these problems."}
              />
            )}
          </div>

          <p className="num mt-3 text-[10px] text-muted">
            {run.crowdSize} asked · {run.engaged} full attention · sentiment{" "}
            {run.meanSentiment.toFixed(2)}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-edge pt-3">
            <div>
              <p className="label">Validation</p>
              {run.pvs !== undefined ? (
                <p className="num mt-1 text-sm">
                  {run.pvs}
                  <span className={`ml-1.5 text-[10px] ${run.pvsPassed ? "text-positive" : "text-negative"}`}>
                    {run.pvsPassed ? "cleared" : "below the bar"}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-faint">No council sat</p>
              )}
              {run.topHub && (
                <p className="num mt-0.5 text-[10px] text-faint">
                  {hubById(run.topHub.hubId)?.label ?? run.topHub.hubId} · fit {run.topHub.fitScore}
                </p>
              )}
            </div>
            <div>
              <p className="label">Committee</p>
              {run.decision ? (
                <>
                  <p
                    className={`num mt-1 text-sm uppercase ${
                      run.decision === "invest"
                        ? "text-positive"
                        : run.decision === "pass"
                          ? "text-negative"
                          : "text-ink"
                    }`}
                  >
                    {run.decision}
                    {run.score !== undefined && (
                      <span className="ml-1.5 text-[10px] text-faint">{run.score.toFixed(2)}</span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-faint">{run.firmName}</p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-faint">Not pitched yet</p>
              )}
            </div>
          </div>

          {run.killShot && (
            <p className="mt-3 border-l-2 border-negative/60 pl-2 text-[11px] leading-relaxed text-ink/75">
              {run.killShot}
            </p>
          )}

          {/* The chair's record of the meeting, kept with the run it decided. */}
          {run.minutes && (
            <details className="mt-3 border-t border-edge pt-3">
              <summary className="label cursor-pointer select-none hover:text-ink">
                Minutes of the meeting{run.minutes.pitch ? " · after the pitch" : ""}
              </summary>
              <div className="mt-3">
                <Minutes minutes={run.minutes} />
              </div>
            </details>
          )}

          {parent && (
            <div className="mt-4 border-t border-edge pt-3">
              <p className="label mb-2">Against the run it came from</p>
              <SessionDiff deltas={diffSessions(parent, run)} />
            </div>
          )}
          {parentMissing && (
            <p className="mt-4 border-t border-edge pt-3 text-[10px] text-faint">
              The run this came from has been removed.
            </p>
          )}
        </>
      )}

      <div className="mt-auto flex items-center gap-3 pt-4">
        <button
          onClick={onLoad}
          className="border border-edge-bright px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/85 transition hover:bg-surface-2"
        >
          Load this idea
        </button>
        <button
          onClick={onRemove}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition hover:text-negative"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function Line({ k, v, struck, accent }: { k: string; v?: string; struck?: boolean; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2">
      <span className="label pt-0.5" style={accent ? { color: "var(--accent)" } : undefined}>
        {k}
      </span>
      <span
        className={`text-[11px] leading-relaxed ${
          struck ? "text-muted line-through decoration-negative/60" : "text-ink/85"
        }`}
      >
        {v ?? "—"}
      </span>
    </div>
  );
}
