"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useVenture } from "@/lib/store";
import { recordVerdict } from "@/lib/sessions";
import { assess, explainVerdict } from "@/lib/advice";
import { pvsReason } from "@/lib/pvs";
import { writeMinutes } from "@/lib/minutes";
import { Minutes } from "@/components/Minutes";
import { PartTwoNav } from "@/components/PartTwoNav";
import { Wordmark } from "@/components/Logo";
import { hubById } from "@/data/globePoints";
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
  const crowd = useVenture((v) => v.crowd);
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

  const dirty = Object.keys(overrides).length > 0;

  // The chair's minutes, rewritten now the founder has pitched: what was
  // answered, what is still open, and what that means for next steps. Always
  // from the room's own weighting, never a what-if from the sliders.
  const minutes = useMemo(() => {
    if (!vf || !deliberation) return null;
    const own = buildVerdict(
      deliberation.verdicts,
      Object.fromEntries(deliberation.roster.filter((r) => r.weight > 0).map((r) => [r.id, r.weight])),
      vf.objections,
      deliberation.verdicts
        .filter((v) => v.stance < 0.2 && v.whatWouldChangeMyMind)
        .map((v) => v.whatWouldChangeMyMind),
      "You have paying design partners where the budget holder signed."
    );
    return writeMinutes({
      firm: deliberation.firm || "The committee",
      snapshot: deliberation,
      verdict: own,
      problem: vf.chosenProblem?.statement,
      objections: vf.objections,
      pitchTurns: vf.pitchTranscript.filter((t) => t.speaker === "founder").length,
      now: vf.pitchTranscript[vf.pitchTranscript.length - 1]?.at,
    });
  }, [vf, deliberation]);

  // The run's saved verdict is the room's own weighting after the meeting —
  // never a what-if from the sliders.
  useEffect(() => {
    if (!vf || !verdict || dirty) return;
    recordVerdict(vf.solution, {
      decision: verdict.decision,
      score: verdict.score,
      killShot: verdict.killShot,
      ...(minutes ? { minutes } : {}),
    });
  }, [vf, verdict, dirty, minutes]);

  if (!vf || !deliberation || !verdict) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ground text-ink">
        <p className="font-mono text-sm text-muted">
          No committee has sat yet.{" "}
          <Link href="/committee" className="text-ink underline">
            Convene one
          </Link>
          .
        </p>
      </main>
    );
  }

  const normalized = normalizeWeights(weights);
  const dissents = detectDissents(deliberation.verdicts, verdict.score);
  const unanswered = countUnanswered(vf.objections);
  const roleOf = (id: string) => deliberation.roster.find((r) => r.id === id)?.role ?? id;

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-edge pb-6">
          <div>
            <Wordmark size={18} />
            <p className="label mt-3" style={{ color: "var(--accent)" }}>
              Part two · the verdict · {deliberation.firm || "Investment committee"}
            </p>
            <h1 className="mt-1 font-mono text-2xl">Diligence report</h1>
          </div>
          <PartTwoNav current="/report" />
        </header>

        {/* 1. The problem ------------------------------------------------- */}
        <Section n="01" title="The problem you are actually solving">
          {vf.chosenProblem ? (
            <>
              <p className="text-lg leading-relaxed text-ink">
                {vf.chosenProblem.statement}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs text-muted">
                <Fact k="Who has it" v={vf.chosenProblem.whoHasIt} />
                <Fact k="Severity, as described" v={`${vf.chosenProblem.severity}/100`} />
                <Fact k="Workaround today" v={vf.chosenProblem.currentWorkaround} />
                <Fact k="Willingness to pay" v={vf.chosenProblem.willingnessToPay} />
              </dl>
            </>
          ) : (
            <>
              <p className="text-lg leading-relaxed text-ink/85">
                &ldquo;{vf.solution}&rdquo;
              </p>
              <p className="glow-accent mt-3 p-3 font-mono text-xs text-ink/85">
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
              <span className="font-mono text-xs text-faint">
                threshold {vf.pvs.threshold} · {vf.pvs.passed ? "cleared" : "not cleared"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {vf.pvs.passed ? "Its weak spot: " : "Mostly because "}
              {pvsReason(vf.pvs)}.
            </p>
            <div className="mt-4 space-y-2">
              <Bar label="Severity, weighted by who'd pay" value={vf.pvs.problemSeverity} />
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
                <div key={h.hubId} className="mb-3 border border-edge p-3">
                  <div className="flex justify-between font-mono text-xs">
                    <span className="uppercase tracking-widest">
                      {hubById(h.hubId)?.label ?? h.hubId}
                    </span>
                    <span className="text-muted">{h.fitScore}/100</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{h.gapSummary}</p>
                </div>
              ))}
          </Section>
        )}

        {/* 4. The panel ---------------------------------------------------- */}
        <Section n="04" title="The panel">
          <p className="mb-4 font-mono text-xs text-faint">
            Re-weight any seat. The verdict recomputes instantly — no model is called.
            {dirty && (
              <button
                onClick={() => setOverrides({})}
                className="ml-3 underline hover:text-ink"
              >
                reset
              </button>
            )}
          </p>

          {deliberation.verdicts.map((v) => {
            const w = weights[v.agentId] ?? 0;
            const isDissent = dissents.includes(v.agentId);

            return (
              <div
                key={v.agentId}
                className={`mb-3 p-3 ${isDissent ? "glow-accent" : "border border-edge"}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm">{roleOf(v.agentId)}</span>
                  <span className="font-mono text-xs text-muted">
                    stance {v.stance.toFixed(2)} · conf {v.confidence.toFixed(2)} ·{" "}
                    {(normalized[v.agentId] * 100 || 0).toFixed(0)}% of the vote
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-ink/85">{v.position}</p>

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
                    aria-label={`Weight for ${roleOf(v.agentId)}`}
                    className="mt-3 w-full accent-[var(--accent)]"
                  />
                )}

                {isDissent && (
                  <p className="label mt-2" style={{ color: "var(--accent)" }}>
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
                ? "text-positive"
                : verdict.decision === "pass"
                  ? "text-negative"
                  : "text-ink"
            }`}
          >
            {verdict.decision === "pass"
              ? "Pass"
              : verdict.decision === "conditional"
                ? "Conditional"
                : "Invest"}
          </p>
          <p className="mt-1 font-mono text-xs text-faint">
            score {verdict.score.toFixed(3)}
            {unanswered > 0 && ` · ${unanswered} unanswered objection${unanswered === 1 ? "" : "s"} cost ${(unanswered * 0.08).toFixed(2)}`}
          </p>

          {verdict.killShot && (
            <div className="mt-4 border border-negative/50 bg-negative/10 p-3">
              <p className="label text-negative">The kill shot</p>
              <p className="mt-1 text-sm text-ink/85">{verdict.killShot}</p>
            </div>
          )}

          {/* Why, in the committee's own words, and what reopens it. A verdict
              that says "conditional" and stops has told the founder nothing. */}
          {(() => {
            const e = explainVerdict(verdict, vf.objections, deliberation.roster);
            return (
              <div className="mt-5 border-t border-edge pt-4">
                <p className="label">Why</p>
                <p className="mt-1 text-sm leading-relaxed text-ink/85">{e.because}</p>
                <p className="label mt-4">What reopens it</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{e.toReopen}</p>
              </div>
            );
          })()}
        </Section>

        {/* 6. What to fix -------------------------------------------------- */}
        <Section n="06" title="What to fix">
          {(() => {
            // Graded from this run's numbers rather than restated from the
            // problem statement. "The people accountable cannot tell which part
            // carries risk" is true of every company in the category and tells
            // a founder nothing to do on Monday.
            if (!crowd) {
              return (
                <p className="text-sm text-muted">
                  Run the market first — the grade is computed from what the crowd
                  actually said, not from the problem statement.
                </p>
              );
            }
            const a = assess(crowd.verdict, crowd.signals, vf.pvs, deliberation.verdicts, roleOf);

            const TONE: Record<string, { label: string; color: string }> = {
              fail: { label: "Do not proceed", color: "var(--negative)" },
              weak: { label: "Weak", color: "var(--accent)" },
              promising: { label: "Promising", color: "var(--accent)" },
              strong: { label: "Strong", color: "var(--positive)" },
            };
            const tone = TONE[a.verdict];

            return (
              <>
                <div
                  className="mb-5 border-l-2 pl-4"
                  style={{ borderColor: tone.color }}
                >
                  <p className="label" style={{ color: tone.color }}>
                    {tone.label}
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-ink">
                    {a.callToAction}
                  </p>
                </div>

                <ol className="space-y-4">
                  {a.findings.map((f, i) => (
                    <li key={i} className="border border-edge p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm text-ink">{f.headline}</p>
                        <span
                          className="label shrink-0"
                          style={{
                            color:
                              f.severity === "fatal"
                                ? "var(--negative)"
                                : f.severity === "serious"
                                  ? "var(--accent)"
                                  : "var(--muted)",
                          }}
                        >
                          {f.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {f.evidence}
                      </p>
                      <p className="mt-2 border-t border-edge pt-2 text-xs leading-relaxed text-ink/85">
                        <span className="label mr-2">do this</span>
                        {f.action}
                      </p>
                    </li>
                  ))}
                  {a.findings.length === 0 && (
                    <li className="text-sm text-muted">
                      Nothing disqualifying surfaced. {a.nextStep}
                    </li>
                  )}
                </ol>
              </>
            );
          })()}
        </Section>

        {/* 7. How the room behaved ---------------------------------------- */}
        <Section n="07" title="How the room behaved">
          <dl className="grid grid-cols-2 gap-2 font-mono text-xs text-muted sm:grid-cols-4">
            <Fact k="Challenges" v={String(deliberation.metrics.challenges)} />
            <Fact k="Rebuttals" v={String(deliberation.metrics.rebuttals)} />
            <Fact k="Concessions" v={String(deliberation.metrics.concessions)} />
            <Fact
              k="σ by round"
              v={deliberation.metrics.varianceByRound.map((x) => x.toFixed(2)).join(" → ")}
            />
          </dl>
          {deliberation.metrics.mindChanges.length > 0 && (
            <div className="mt-4 border border-positive/40 bg-positive/5 p-3">
              <p className="label text-positive">Conclusions no single agent started with</p>
              {deliberation.metrics.mindChanges.map((c) => (
                <p key={c.agentId} className="num mt-1 text-xs text-ink/75">
                  {roleOf(c.agentId)} {c.from.toFixed(2)} → {c.to.toFixed(2)}
                  {c.conceded && <span className="ml-1 text-positive">conceded</span>}
                </p>
              ))}
            </div>
          )}
        </Section>

        {minutes && (
          <Section n="08" title="Minutes of the meeting">
            <Minutes minutes={minutes} size="md" />
          </Section>
        )}

        <p className="mt-12 border-t border-edge pt-4 font-mono text-[10px] text-faint">
          AI simulation. Not affiliated with, endorsed by, or representing this firm.
          Partner personas are composites, not real individuals.
        </p>
      </div>
    </main>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-edge py-8">
      <p className="font-mono text-[10px] uppercase tracking-widest text-faint">{n}</p>
      <h2 className="mb-4 mt-1 font-mono text-sm uppercase tracking-widest text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-faint">{k}</dt>
      <dd className="mt-0.5 text-ink/85">{v}</dd>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-edge">
        <div className="h-full bg-muted" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
