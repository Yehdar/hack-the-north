"use client";

import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// REAL WORLD PROBLEMS TO YOUR IDEA.
//
// The same product can be sold against several different problems, and the one
// the founder has in mind is rarely the one the market feels. These are the
// others the crowd will be offered, kept out of the way in a dropdown rather
// than laid out as four competing cards: the founder tests one problem, and
// can swap to another if one of these is closer to their claim.
// ============================================================================

export function OtherProblems({
  problems,
  onUse,
}: {
  problems: ProblemStatement[];
  /** Test this one instead. Omit to leave the list read only. */
  onUse?: (problem: ProblemStatement) => void;
}) {
  if (problems.length === 0) return null;

  return (
    <details className="group w-full">
      <summary className="flex cursor-pointer select-none items-start gap-1.5 text-[11px] leading-snug text-muted transition hover:text-ink [&::-webkit-details-marker]:hidden">
        {/* A caret that turns, rather than another box on a screen of boxes. */}
        <span
          aria-hidden
          className="mt-[3px] text-[9px] transition-transform duration-200 group-open:rotate-90"
        >
          ▶
        </span>
        <span className="flex-1">
          Real world problems that could use your solution
          <span className="ml-1 text-faint">({problems.length})</span>
        </span>
      </summary>

      <ul className="mt-2 max-h-[168px] space-y-3 overflow-y-auto pl-3.5 pr-1">
        {problems.map((p) => (
          <li key={p.id}>
            <p className="text-[12px] leading-relaxed text-ink/85">{p.statement}</p>
            {p.whoHasIt && (
              <p className="mt-1 text-[10px] leading-relaxed text-muted">Felt by {lower(p.whoHasIt)}</p>
            )}
            {onUse && (
              <button
                onClick={() => onUse(p)}
                className="label mt-1.5 underline-offset-4 hover:text-ink hover:underline"
              >
                Test this one instead
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function lower(t: string): string {
  const s = t.trim().replace(/[.]$/, "");
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
