import type { ProblemStatement } from "@/lib/types";
import type { Attention, CrowdReaction, CrowdVerdict } from "./types";

// Pure, with type-only imports: the server aggregates the whole crowd with it,
// and the discovery screen aggregates whatever arrived when a stream stalls.

/**
 * What the crowd concluded. Pure. No model call, so this recomputes instantly
 * when the founder edits a problem or filters the crowd.
 */
export function aggregate(
  reactions: CrowdReaction[],
  problems: ProblemStatement[]
): CrowdVerdict {
  const votes = problems.map((p) => {
    const mine = reactions.filter((r) => r.problemId === p.id);
    const payers = mine.filter((r) => r.wouldPay).length;
    return {
      problemId: p.id,
      votes: mine.length,
      meanSeverity: mine.length
        ? mine.reduce((a, r) => a + r.problemSeverity, 0) / mine.length
        : 0,
      payRate: mine.length ? payers / mine.length : 0,
    };
  });

  // Ranked by weight of feeling, not headcount alone: a problem twelve people
  // have badly and would pay for beats one thirty people have mildly.
  const ranked = [...votes].sort(
    (a, b) =>
      b.votes * (b.meanSeverity / 100) * (0.5 + b.payRate) -
      a.votes * (a.meanSeverity / 100) * (0.5 + a.payRate)
  );

  const attention: Record<Attention, number> = { full: 0, partial: 0, ignore: 0 };
  for (const r of reactions) attention[r.attention]++;

  const sentiments = reactions.map((r) => r.sentiment);
  const mean = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : 0;
  const spread = sentiments.length
    ? Math.sqrt(sentiments.reduce((a, s) => a + (s - mean) ** 2, 0) / sentiments.length)
    : 0;

  const marketProblemId = ranked[0]?.votes ? ranked[0].problemId : null;
  const pitchedProblemId = problems[0]?.id ?? null;

  return {
    reactions,
    problemVotes: ranked,
    marketProblemId,
    pitchedProblemId,
    mismatch: Boolean(marketProblemId && pitchedProblemId && marketProblemId !== pitchedProblemId),
    attention,
    meanSentiment: mean,
    sentimentSpread: spread,
  };
}
