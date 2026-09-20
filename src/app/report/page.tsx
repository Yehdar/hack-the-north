"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useVenture } from "@/lib/store";
import { recordVerdict } from "@/lib/sessions";
import { assess } from "@/lib/advice";
import { Meter } from "@/components/Progress";
import { pvsReason } from "@/lib/pvs";
import { writeMinutes } from "@/lib/minutes";
import { Minutes } from "@/components/Minutes";
import { PartTwoNav } from "@/components/PartTwoNav";
import { Wordmark } from "@/components/Logo";
import { hubById } from "@/data/globePoints";
import {
  buildVerdict,
  detectDissents,
  type WeightMap,
} from "@/lib/verdict";

// ============================================================================
// THE REPORT, B5. Track B owns this page.
//
// Everything here is computed from cached agent output. Moving a weight slider
// re-runs pure functions and never calls a model, which is the point: the
// founder gets to interrogate how the verdict was reached, not just read it.
// ============================================================================

export default function Report() {
  const vf = useVenture((v) => v.ventureFile);
  const deliberation = useVenture((v) => v.deliberation);
  const crowd = useVenture((v) => v.crowd);

  // The room's own weighting. There is no override any more. A founder
  // cannot tell what re-weighting a partner is supposed to mean, so the slider
  // was a control that invited a question it could not answer.
  const weights: WeightMap = useMemo(() => {
    const base: WeightMap = {};
    for (const r of deliberation?.roster ?? []) {
      if (r.weight > 0) base[r.id] = r.weight;
    }
    return base;
  }, [deliberation]);

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

  // Saved for the dashboard. Still computed, because the dashboard compares
  // runs and needs something comparable. It is just no longer shown to the
  // founder as a grade.
  useEffect(() => {
    if (!vf || !verdict) return;
    recordVerdict(vf.solution, {
      decision: verdict.decision,
      score: verdict.score,
      killShot: verdict.killShot,
      ...(minutes ? { minutes } : {}),
    });
  }, [vf, verdict, minutes]);

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
  const dissents = detectDissents(deliberation.verdicts, verdict.score);
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
        <Section n="04" title="What each partner said">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Their own words. Where they disagreed with each other is worth more
            than where they agreed.
          </p>

          {deliberation.verdicts.map((v) => {
            const isDissent = dissents.includes(v.agentId);

            return (
              <div
                key={v.agentId}
                className={`mb-3 p-3 ${isDissent ? "glow-accent" : "border border-edge"}`}
              >
                {/* A word, not a coordinate. "stance 0.14 · conf 0.65" is the
                    shape of the maths, and nobody reading a report needs it.
                    The weight sliders went with it. A founder cannot tell what
                    re-weighting a partner is supposed to mean. */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink">{roleOf(v.agentId)}</span>
                  <span
                    className="shrink-0 text-xs"
                    style={{
                      color:
                        v.stance > 0.2
                          ? "var(--go)"
                          : v.stance < -0.2
                            ? "var(--stop)"
                            : "var(--caution)",
                    }}
                  >
                    {v.stance > 0.2 ? "backed it" : v.stance < -0.2 ? "against it" : "undecided"}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-ink/85">
                  &ldquo;{v.position}&rdquo;
                </p>

                {v.whatWouldChangeMyMind && (
                  <p className="mt-2 border-t border-edge pt-2 text-xs leading-relaxed text-muted">
                    <span className="label mr-2">would change their mind</span>
                    {v.whatWouldChangeMyMind}
                  </p>
                )}

                {isDissent && (
                  <p className="label mt-2" style={{ color: "var(--accent)" }}>
                    disagreed with the rest of the room
                  </p>
                )}
              </div>
            );
          })}
        </Section>

        {/* The verdict section is gone on purpose.
            A pass/fail bar turns this into a game you either win or lose, and
            the reviewer was right that it is the wrong frame. The useful thing
            is what to change, not a grade out of ten. What the room concluded
            still reaches the founder, but as words in "What each partner said"
            and as actions in "What to fix". */}

        {/* 6. What to fix -------------------------------------------------- */}
        <Section n="05" title="What to fix, and what to do next">
          {(() => {
            // Graded from this run's numbers rather than restated from the
            // problem statement. "The people accountable cannot tell which part
            // carries risk" is true of every company in the category and tells
            // a founder nothing to do on Monday.
            if (!crowd) {
              return (
                <p className="text-sm text-muted">
                  Run the market first. The grade is computed from what the crowd
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
        {/* "How the room behaved" removed: challenges, rebuttals and σ by
            round are how WE know the deliberation worked, not something a
            founder can act on, and nobody could tell how they were computed. */}

        {minutes && (
          <Section n="06" title="Minutes of the meeting">
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
    <Meter label={label} value={value} />
  );
}
