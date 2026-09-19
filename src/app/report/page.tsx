"use client";

import { useMemo, useState } from "react";
import { useVenture } from "@/lib/store";
import {
  buildVerdict,
  countUnanswered,
  detectDissents,
  normalizeWeights,
  type WeightMap,
} from "@/lib/verdict";

// ============================================================================
// THE REPORT — B5. Track B owns this page.
//
// Everything here is computed from cached agent output. Moving a weight slider
// re-runs pure functions and never calls a model, which is the point: the
// founder gets to interrogate how the verdict was reached, not just read it.
// ============================================================================

export default function Report() {
  const vf = useVenture((v) => v.ventureFile);
  const deliberation = useVenture((v) => v.deliberation);
  const [overrides, setOverrides] = useState<WeightMap>({});

  const weights: WeightMap = useMemo(() => {
    const base: WeightMap = {};
    for (const r of deliberation?.roster ?? []) {
      if (r.weight > 0) base[r.id] = overrides[r.id] ?? r.weight;
    }
    return base;
  }, [deliberation, overrides]);

  const verdict = useMemo(() => {
    if (!deliberation || !vf) return null;
    return buildVerdict(
      deliberation.verdicts,
      weights,
      vf.objections,
      deliberation.verdicts
        .filter((v) => v.stance < 0.2 && v.whatWouldChangeMyMind)
        .map((v) => v.whatWouldChangeMyMind),
      "You have paying design partners where the budget holder signed."
    );
  }, [deliberation, vf, weights]);

  if (!vf || !deliberation || !verdict) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="font-mono text-sm text-white/50">
          No committee has sat yet.{" "}
          <a href="/" className="underline">
            Convene one
          </a>
          .
        </p>
      </main>
    );
  }

  const normalized = normalizeWeights(weights);
  const dissents = detectDissents(deliberation.verdicts, verdict.score);
  const unanswered = countUnanswered(vf.objections);
  const dirty = Object.keys(overrides).length > 0;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-8 py-12">
        <header className="flex items-start justify-between border-b border-white/15 pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              {deliberation.firm || "Investment committee"}
            </p>
            <h1 className="mt-1 font-mono text-2xl">Diligence report</h1>
          </div>
          <a href="/" className="font-mono text-xs text-white/40 hover:text-white">
            ← globe
          </a>
        </header>

        {/* 1. The problem ------------------------------------------------- */}
        <Section n="01" title="The problem you are actually solving">
          {vf.chosenProblem ? (
            <>
              <p className="text-lg leading-relaxed text-white">
                {vf.chosenProblem.statement}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs text-white/60">
                <Fact k="Who has it" v={vf.chosenProblem.whoHasIt} />
                <Fact k="Severity" v={`${vf.chosenProblem.severity}/100`} />
                <Fact k="Workaround today" v={vf.chosenProblem.currentWorkaround} />
                <Fact k="Willingness to pay" v={vf.chosenProblem.willingnessToPay} />
              </dl>
            </>
          ) : (
            <>
              <p className="text-lg leading-relaxed text-white/80">
                &ldquo;{vf.solution}&rdquo;
              </p>
              <p className="mt-3 border border-amber-700/50 bg-amber-950/20 p-3 font-mono text-xs text-amber-300">
                Discovery has not run, so no validated problem statement exists. The
                committee was told this, and it counted against you.
              </p>
            </>
          )}
        </Section>

        {/* 2. PVS ---------------------------------------------------------- */}
        {vf.pvs && (
          <Section n="02" title="Problem validation score">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-4xl">{vf.pvs.total}</span>
              <span className="font-mono text-xs text-white/40">
                threshold {vf.pvs.threshold} · {vf.pvs.passed ? "cleared" : "not cleared"}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <Bar label="Problem severity" value={vf.pvs.problemSeverity} />
              <Bar label="Market gap" value={vf.pvs.marketGap} />
              <Bar label="Hub fit" value={vf.pvs.hubFit} />
              <Bar label="Evidence strength" value={vf.pvs.evidenceStrength} />
            </div>
          </Section>
        )}

        {/* 3. Hubs --------------------------------------------------------- */}
        {Object.values(vf.hubFindings).length > 0 && (
          <Section n="03" title="Where it lands">
            {Object.values(vf.hubFindings)
              .sort((a, b) => b.fitScore - a.fitScore)
              .map((h) => (
                <div key={h.hubId} className="mb-3 border border-white/15 p-3">
                  <div className="flex justify-between font-mono text-xs">
                    <span className="uppercase tracking-widest">{h.hubId}</span>
                    <span className="text-white/50">{h.fitScore}/100</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">{h.gapSummary}</p>
                </div>
              ))}
          </Section>
        )}

        {/* 4. The panel ---------------------------------------------------- */}
        <Section n="04" title="The panel">
          <p className="mb-4 font-mono text-xs text-white/40">
            Re-weight any seat. The verdict recomputes instantly — no model is called.
            {dirty && (
              <button
                onClick={() => setOverrides({})}
                className="ml-3 underline hover:text-white"
              >
                reset
              </button>
            )}
          </p>

          {deliberation.verdicts.map((v) => {
            const entry = deliberation.roster.find((r) => r.id === v.agentId);
            const w = weights[v.agentId] ?? 0;
            const isDissent = dissents.includes(v.agentId);

            return (
              <div
                key={v.agentId}
                className={`mb-3 border p-3 ${isDissent ? "border-amber-600/60 bg-amber-950/15" : "border-white/15"}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm">{entry?.role ?? v.agentId}</span>
                  <span className="font-mono text-xs text-white/50">
                    stance {v.stance.toFixed(2)} · conf {v.confidence.toFixed(2)} ·{" "}
                    {(normalized[v.agentId] * 100 || 0).toFixed(0)}% of the vote
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-white/80">{v.position}</p>

                {w > 0 && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={w}
                    onChange={(e) =>
                      setOverrides((o) => ({ ...o, [v.agentId]: Number(e.target.value) }))
                    }
                    className="mt-3 w-full accent-white"
                  />
                )}

                {isDissent && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-amber-400">
                    dissent — not averaged away
                  </p>
                )}
              </div>
            );
          })}
        </Section>

        {/* 5. Verdict ------------------------------------------------------ */}
        <Section n="05" title="Verdict">
          <p
            className={`font-mono text-4xl uppercase ${
              verdict.decision === "invest"
                ? "text-emerald-400"
                : verdict.decision === "pass"
                  ? "text-red-400"
                  : "text-amber-400"
            }`}
          >
            {verdict.decision}
          </p>
          <p className="mt-1 font-mono text-xs text-white/40">
            score {verdict.score.toFixed(3)}
            {unanswered > 0 && ` · ${unanswered} unanswered objection${unanswered === 1 ? "" : "s"} cost ${(unanswered * 0.08).toFixed(2)}`}
          </p>

          {verdict.killShot && (
            <div className="mt-4 border border-red-800/60 bg-red-950/20 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-red-400">
                The kill shot
              </p>
              <p className="mt-1 text-sm text-white/85">{verdict.killShot}</p>
            </div>
          )}

          <p className="mt-4 font-mono text-xs text-white/50">
            Come back when: <span className="text-white/80">{verdict.comeBackWhen}</span>
          </p>
        </Section>

        {/* 6. What to fix -------------------------------------------------- */}
        <Section n="06" title="What to fix">
          <ol className="space-y-3">
            {deliberation.verdicts
              .filter((v) => v.whatWouldChangeMyMind)
              .sort((a, b) => a.stance - b.stance)
              .map((v) => {
                const entry = deliberation.roster.find((r) => r.id === v.agentId);
                return (
                  <li key={v.agentId} className="border-l-2 border-white/25 pl-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                      raised by {entry?.role ?? v.agentId}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-white/85">
                      {v.whatWouldChangeMyMind}
                    </p>
                  </li>
                );
              })}
          </ol>
        </Section>

        {/* 7. How the room behaved ---------------------------------------- */}
        <Section n="07" title="How the room behaved">
          <dl className="grid grid-cols-2 gap-2 font-mono text-xs text-white/60 sm:grid-cols-4">
            <Fact k="Challenges" v={String(deliberation.metrics.challenges)} />
            <Fact k="Rebuttals" v={String(deliberation.metrics.rebuttals)} />
            <Fact k="Concessions" v={String(deliberation.metrics.concessions)} />
            <Fact
              k="σ by round"
              v={deliberation.metrics.varianceByRound.map((x) => x.toFixed(2)).join(" → ")}
            />
          </dl>
          {deliberation.metrics.mindChanges.length > 0 && (
            <div className="mt-4 border border-emerald-900/60 bg-emerald-950/15 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500">
                Conclusions no single agent started with
              </p>
              {deliberation.metrics.mindChanges.map((c) => (
                <p key={c.agentId} className="mt-1 font-mono text-xs text-white/75">
                  {c.agentId} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                  {c.conceded && <span className="ml-1 text-emerald-400">conceded</span>}
                </p>
              ))}
            </div>
          )}
        </Section>

        <p className="mt-12 border-t border-white/10 pt-4 font-mono text-[10px] text-white/30">
          AI simulation. Not affiliated with, endorsed by, or representing this firm.
          Partner personas are composites, not real individuals.
        </p>
      </div>
    </main>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 py-8">
      <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">{n}</p>
      <h2 className="mb-4 mt-1 font-mono text-sm uppercase tracking-widest text-white/70">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-white/35">{k}</dt>
      <dd className="mt-0.5 text-white/80">{v}</dd>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] text-white/50">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-white/10">
        <div className="h-full bg-white/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
