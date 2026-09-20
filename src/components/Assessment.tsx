"use client";

import type { Assessment as Advice, Verdict } from "@/lib/advice";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// WHAT IT MEANS. The screen the whole of Part 1 exists to produce.
//
// The crowd's answer used to arrive as six numbers and a score out of 100.
// Every one of those is evidence for a conclusion that was never stated, and a
// founder cannot act on 47/100. The analysis already existed in lib/advice.ts
// and was rendered on the report, at the very end, after the committee. It
// belongs here: the bet, whether it survived, the evidence under each line,
// what the market uses instead, and the one thing to do next.
// ============================================================================

const TONE: Record<Verdict, { label: string; color: string }> = {
  fail: { label: "Stop and rethink", color: "var(--stop)" },
  weak: { label: "Not this, not yet", color: "var(--stop)" },
  promising: { label: "Real, not proven", color: "var(--caution)" },
  strong: { label: "Keep going", color: "var(--go)" },
};

const SEVERITY: Record<Advice["findings"][number]["severity"], string> = {
  fatal: "var(--stop)",
  serious: "var(--caution)",
  "worth fixing": "var(--border-bright)",
};

/** A number a founder can feel. "Badly" beats "severity 78". */
function hurts(n: number): string {
  if (n >= 75) return "badly";
  if (n >= 55) return "enough to act on";
  if (n >= 35) return "mildly";
  return "barely";
}

export function Assessment({
  advice,
  bet,
  asked,
  have,
  payRate,
  severity,
}: {
  advice: Advice;
  /** The problem the market actually has, which is what was tested. */
  bet?: ProblemStatement;
  asked: number;
  have: number;
  payRate: number;
  severity: number;
}) {
  const tone = TONE[advice.verdict];

  return (
    <div className="text-[14px] leading-relaxed">
      <p className="label">What it means</p>

      {bet && (
        <div className="mt-2">
          <p className="text-ink">{bet.statement}</p>
          {bet.whoHasIt && <p className="mt-0.5 text-muted">Felt by {lower(bet.whoHasIt)}</p>}
        </div>
      )}

      {/* The verdict, in a sentence, before any number. */}
      <div className="mt-3 border-l-2 pl-3" style={{ borderColor: tone.color }}>
        <p className="label" style={{ color: tone.color }}>
          {tone.label}
        </p>
        <p className="mt-1 text-[17px] leading-snug text-ink">{advice.callToAction}</p>
      </div>

      {have > 0 && (
        <p className="mt-3 text-muted">
          <span className="text-ink">
            {have} of the {asked} people we asked have it
          </span>{" "}
          and {Math.round(payRate * 100)}% of those would pay to fix it. It hurts them {hurts(severity)}.
        </p>
      )}

      {bet?.currentWorkaround && (
        <p className="mt-2 text-muted">
          Today they use <span className="text-ink">{lower(bet.currentWorkaround)}</span> That is what you
          are competing with, not another product.
        </p>
      )}

      {advice.findings.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-edge pt-3">
          {advice.findings.slice(0, 3).map((f) => (
            <li key={f.headline}>
              <p className="flex items-baseline gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: SEVERITY[f.severity] }}
                />
                <span className="text-ink">{f.headline}</span>
              </p>
              <p className="mt-0.5 pl-3.5 text-muted">{f.evidence}</p>
              <p className="mt-1 pl-3.5">
                <span className="label">Do this</span>{" "}
                <span className="text-ink/85">{f.action}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-edge pt-3">
        <span className="label">Next</span>{" "}
        <span className="text-ink/85">{advice.nextStep}</span>
      </p>
    </div>
  );
}

/** Sentence fragments read badly mid sentence with a capital on the front. */
function lower(t: string): string {
  const s = t.trim();
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
