"use client";

import { useState } from "react";
import { Light } from "@/components/Light";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// THE BET. One sentence: the problem the founder's product implies.
//
// This used to be four candidate problem cards. The founder made one claim;
// the system invents rivals so the crowd has something else to choose, which
// is a reasonable internal mechanism and a strange thing to put in front of a
// person. The rivals stay in the run, because the crowd picking one of them is
// what later becomes pivot advice. Only the bet is on screen.
//
// It is editable on purpose. If the sentence is not the founder's claim, the
// test is not fair, and an edit is cheap: the same crowd is asked again.
// ============================================================================

export function Bet({
  problem,
  label,
  text,
  vote,
  isMarket = false,
  onRewrite,
}: {
  problem: ProblemStatement;
  /** Omit to let the sentence speak for itself. */
  label?: string;
  /** Shown instead of the problem statement, for the founder's own words. */
  text?: string;
  vote?: { votes: number; payRate: number };
  /** This is what the crowd said they have, rather than what was pitched. */
  isMarket?: boolean;
  /** Ask the market again with the founder's own wording. Omit to lock it. */
  onRewrite?: (statement: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className={`panel p-3 ${isMarket ? "glow-accent" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        {label && <span className="text-[13px] font-medium text-ink">{label}</span>}
        {vote && (
          <Light
            signal={
              vote.votes === 0 ? "off" : vote.payRate >= 0.55 ? "go" : vote.payRate >= 0.3 ? "caution" : "stop"
            }
            label=""
            size={9}
          />
        )}
      </div>

      {draft === null ? (
        <>
          <p className={`text-[14px] leading-relaxed text-ink/90 ${label ? "mt-1.5" : ""}`}>
            {text ?? problem.statement}
          </p>
          {!text && problem.whoHasIt && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted">Felt by {lower(problem.whoHasIt)}</p>
          )}
        </>
      ) : (
        <div className="mt-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className="w-full resize-none border border-edge bg-ground p-2 text-[14px] leading-relaxed text-ink focus:border-edge-bright focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => {
                const next = draft.trim();
                setDraft(null);
                if (next && next !== problem.statement) onRewrite?.(next);
              }}
              className="bg-accent px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-ground transition hover:brightness-110"
            >
              Ask them this instead
            </button>
            <button
              onClick={() => setDraft(null)}
              className="font-mono text-[12px] uppercase tracking-[0.12em] text-faint transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {vote && (
        <p className="mt-2 border-t border-edge pt-1.5 text-[12px] leading-relaxed text-muted">
          <span className="text-ink">{vote.votes} people</span> have this
          {vote.votes > 0 && (
            <>
              {" · "}
              <span
                style={{
                  color:
                    vote.payRate >= 0.55
                      ? "var(--go)"
                      : vote.payRate >= 0.3
                        ? "var(--caution)"
                        : "var(--stop)",
                }}
              >
                {(vote.payRate * 100).toFixed(0)}% would pay
              </span>
            </>
          )}
        </p>
      )}

      {onRewrite && draft === null && (
        <button
          onClick={() => setDraft(problem.statement)}
          className="label mt-2 underline-offset-4 hover:text-ink hover:underline"
        >
          Not your claim? Rewrite it
        </button>
      )}
    </div>
  );
}

function lower(t: string): string {
  const s = t.trim().replace(/[.]$/, "");
  return /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
