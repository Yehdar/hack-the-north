"use client";

import { Hint } from "@/components/Hint";
import { Light, LightRow } from "@/components/Light";
import { Meter } from "@/components/Progress";
import { Assessment as AssessmentCard } from "@/components/Assessment";
import type { Assessment } from "@/lib/advice";
import type { ProblemStatement } from "@/lib/types";
import type { Attention } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import type { HubRank } from "@/lib/discovery/rank";
import type { CallSummary } from "@/lib/store";

// ============================================================================
// THE EVIDENCE PART 1 GATHERED. One component, three places.
//
// This used to live only in the sidebar next to the globe, so it was gone the
// moment you left the page: closing the reveal or walking into the boardroom
// left the case for the pitch behind. It is the same six sections wherever it
// appears, built from whatever each screen already has on hand — the study
// page's own live state, or the run persisted in the shared store once Part 1
// is behind you.
// ============================================================================

export type EvidenceReaction = {
  personaId: number;
  name: string;
  title: string;
  attention: Attention;
  reason: string;
  problemId: string | null;
  wouldPay: boolean;
};

export type MarketEvidenceProps = {
  /** What the run means, in words. Nothing below this renders without it. */
  advice?: Assessment | null;
  bet?: ProblemStatement;
  asked: number;
  have: number;
  payRate: number;
  severity: number;

  hubRanking: HubRank[];
  hubName: (id: string) => string;

  counts: { full: number; partial: number; ignore: number };
  total: number;
  /** False before anyone has answered: the lights have nothing to show yet. */
  hasCrowd: boolean;
  emptyCrowdCopy?: string;
  sentimentSpread?: number;

  stanceFilter: Attention | null;
  /** Omit to show the lights without making them clickable. */
  onFilterChange?: (f: Attention | null) => void;

  signals?: CrowdSignals | null;

  callReport: CallSummary[];

  /** In arrival order. The panel takes the most recent 40 itself. */
  reactions: EvidenceReaction[];
  /** Whether the run has produced any reactions yet, for the empty copy. */
  answered: boolean;
  listening?: boolean;
  /** Omit to render the list read-only, with no call to open. */
  onSelectReaction?: (personaId: number) => void;
};

export function MarketEvidence({
  advice,
  bet,
  asked,
  have,
  payRate,
  severity,
  hubRanking,
  hubName,
  counts,
  total,
  hasCrowd,
  emptyCrowdCopy,
  sentimentSpread,
  stanceFilter,
  onFilterChange,
  signals,
  callReport,
  reactions,
  answered,
  listening,
  onSelectReaction,
}: MarketEvidenceProps) {
  const visibleReactions = reactions
    .filter((r) => r.reason)
    .filter((r) => !stanceFilter || r.attention === stanceFilter)
    .slice(-40)
    .reverse();

  return (
    <>
      {/* ---- what it means: the conclusion, before the evidence ---- */}
      {advice && bet && (
        <div className="border-b border-edge p-4">
          <AssessmentCard
            advice={advice}
            bet={bet}
            asked={asked}
            have={have}
            payRate={payRate}
            severity={severity}
          />
        </div>
      )}

      {/* ---- where the problem lands ---- */}
      {hubRanking.length > 0 && (
        <div className="border-b border-edge p-4">
          <p className="label">
            Where it lands
            <Hint>
              Each city&apos;s fit for the market&apos;s problem, from the crowd alone: how
              many people there have this problem, how many would pay to fix it, and how
              badly it hurts them. The strongest one goes to the committee with you.
            </Hint>
          </p>
          <div className="mt-3 space-y-1">
            {hubRanking.slice(0, 6).map((h, i) => (
              <div key={h.hubId} className={`p-2 ${i === 0 ? "glow-accent" : "panel"}`}>
                <Meter
                  label={hubName(h.hubId)}
                  value={h.fitScore}
                  color={i === 0 ? "var(--accent)" : "var(--border-bright)"}
                />
                <p className="mt-1 text-[13px] leading-relaxed text-faint">
                  {h.haveIt} of the {h.asked} we asked here have this problem
                  {h.haveIt > 0 && `, ${h.wouldPay} would pay to fix it`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- the crowd, as lights rather than bars ---- */}
      <div className="border-b border-edge p-4">
        <p className="label">
          The crowd
          <Hint>
            Attention is whether they cared at all; sentiment is how warmly. A spread near
            zero would mean the crowd collapsed into one voice. Which is a bug, not a
            consensus.
          </Hint>
        </p>
        {hasCrowd ? (
          <>
            <div className="mt-2 divide-y divide-edge">
              <LightRow
                signal="go"
                title="Supports"
                count={counts.full}
                total={total}
                note="Has the problem and wants it solved"
                onClick={onFilterChange ? () => onFilterChange(stanceFilter === "full" ? null : "full") : undefined}
                selected={stanceFilter === null ? undefined : stanceFilter === "full"}
              />
              <LightRow
                signal="caution"
                title="Unsure"
                count={counts.partial}
                total={total}
                note="Sees it, not convinced enough to act"
                onClick={
                  onFilterChange ? () => onFilterChange(stanceFilter === "partial" ? null : "partial") : undefined
                }
                selected={stanceFilter === null ? undefined : stanceFilter === "partial"}
              />
              <LightRow
                signal="stop"
                title="Rejected"
                count={counts.ignore}
                total={total}
                note="Not a problem they think about"
                onClick={
                  onFilterChange ? () => onFilterChange(stanceFilter === "ignore" ? null : "ignore") : undefined
                }
                selected={stanceFilter === null ? undefined : stanceFilter === "ignore"}
              />
            </div>
            {sentimentSpread !== undefined && (
              <p className="mt-3 border-t border-edge pt-2 text-[14px] leading-relaxed text-muted">
                {sentimentSpread < 0.12
                  ? "They all felt much the same way, which usually means the crowd was too alike."
                  : "Opinions were genuinely split, which is what a real market looks like."}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-faint">{emptyCrowdCopy ?? "Nobody asked yet."}</p>
        )}
      </div>

      {/* ---- who responded, and the one warning worth interrupting for ---- */}
      {signals && (
        <div className="border-b border-edge p-4">
          <p className="label">
            Who responded
            <Hint>
              Which attributes separate the people who paid full attention from everyone
              else. If your fans cannot sign a cheque, it shows up here first.
            </Hint>
          </p>

          {signals.warning && (
            <p className="glow-accent mt-2 p-2.5 text-sm leading-relaxed text-ink/90">
              {signals.warning}
            </p>
          )}

          <div className="mt-3 space-y-1.5">
            {signals.signals.slice(0, 4).map((sig) => (
              <div key={sig.attribute}>
                <div className="flex justify-between num text-sm">
                  <span className="text-muted">{sig.attribute}</span>
                  <span className={sig.delta > 0 ? "text-accent" : "text-cold"}>
                    {sig.engagedMean} vs {sig.ignoredMean}
                  </span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-faint">{sig.reading}</p>
              </div>
            ))}
            {signals.signals.length === 0 && (
              <p className="text-sm text-faint">
                No attribute separates the people who engaged from the people who did not.
                That is itself a finding: the response is not concentrated in a segment.
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <p className="label text-positive">Strongest yes</p>
              {signals.positives.map((q) => (
                <p key={q.name} className="mt-1 text-sm leading-relaxed text-ink/70">
                  <span className="text-muted">{q.name}, {q.title}:</span> &ldquo;{q.quote}&rdquo;
                </p>
              ))}
            </div>
            <div>
              <p className="label text-negative">Strongest no</p>
              {signals.negatives.map((q) => (
                <p key={q.name} className="mt-1 text-sm leading-relaxed text-ink/70">
                  <span className="text-muted">{q.name}, {q.title}:</span> &ldquo;{q.quote}&rdquo;
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- what the calls turned up ---- */}
      <div className="border-b border-edge p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="label">
            Report
            <Hint>
              What came out of the calls you made. Talk to anyone in the crowd, then
              summarise the conversation and it is kept here with the run.
            </Hint>
          </p>
          {callReport.length > 0 && (
            <span className="num text-sm text-faint">
              {callReport.length} {callReport.length === 1 ? "call" : "calls"}
            </span>
          )}
        </div>
        {callReport.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-faint">
            Call someone from the crowd and summarise it, and the notes land here.
          </p>
        ) : (
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {callReport.map((entry) => (
              <div key={entry.personaId} className="border-l-2 border-edge pl-3">
                <p className="text-sm text-ink">
                  {entry.name} <span className="text-muted">· {entry.role}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink/80">{entry.summary}</p>
                {entry.takeaway && (
                  <p className="mt-1 text-sm leading-relaxed text-muted">{entry.takeaway}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- who said what, one at a time ---- */}
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="label">
            {stanceFilter === "full"
              ? "Supports"
              : stanceFilter === "partial"
                ? "Unsure"
                : stanceFilter === "ignore"
                  ? "Rejected"
                  : "Community reactions"}
          </p>
          {stanceFilter && onFilterChange && (
            <button
              onClick={() => onFilterChange(null)}
              className="label underline-offset-2 hover:text-ink hover:underline"
            >
              show everyone
            </button>
          )}
        </div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {answered ? (
            visibleReactions.map((r) => {
              const row = (
                <>
                  <div className="flex items-center gap-2">
                    <Light
                      signal={r.attention === "full" ? "go" : r.attention === "partial" ? "caution" : "stop"}
                      label=""
                      size={8}
                    />
                    <span className="truncate text-sm text-ink">{r.name}</span>
                    <span className="truncate text-sm text-muted">{r.title}</span>
                  </div>
                  <p className="mt-1 pl-4 text-sm leading-relaxed text-ink/80">
                    &ldquo;{r.reason}&rdquo;
                  </p>
                  <p className="mt-0.5 pl-4 text-sm text-faint">
                    {r.problemId
                      ? r.wouldPay
                        ? "Has this problem · would pay"
                        : "Has this problem · would not pay"
                      : "None of these are their problem"}
                  </p>
                </>
              );
              return onSelectReaction ? (
                <button
                  key={r.personaId}
                  onClick={() => onSelectReaction(r.personaId)}
                  className="block w-full rounded-[3px] px-2 py-1.5 text-left transition hover:bg-surface-2"
                >
                  {row}
                </button>
              ) : (
                <div key={r.personaId} className="rounded-[3px] px-2 py-1.5">
                  {row}
                </div>
              );
            })
          ) : (
            <p className="text-sm leading-relaxed text-faint">
              {listening
                ? "Every answer is collected here once everyone has spoken."
                : "Answers appear here once the crowd has spoken."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
