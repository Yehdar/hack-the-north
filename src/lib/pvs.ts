import type { AgentVerdict, PVSBreakdown, ProblemStatement } from "@/lib/types";
import type { CrowdVerdict } from "@/lib/discovery/types";
import { normalizeWeights, type WeightMap } from "@/lib/verdict";

// ============================================================================
// PROBLEM VALIDATION SCORE — pure functions only.
//
// Same discipline as src/lib/verdict.ts: no async, no fetch, no model calls.
// Moving a weight slider re-runs all of this synchronously on cached data. If
// anything here ever needs to await, the design is wrong.
//
// The soft gate is 60. Below it the founder is warned and can still pitch —
// and the committee is told they pitched anyway, which is the honest cost.
// ============================================================================

export const PVS_THRESHOLD = 60;

export const PVS_WEIGHTS = {
  problemSeverity: 0.35,
  marketGap: 0.25,
  hubFit: 0.25,
  evidenceStrength: 0.15,
} as const;

/** Below this share of payers, the problem is a complaint, not a market. */
const PAY_FLOOR = 0.3;
/** People with the problem it takes before the evidence counts in full. */
const FULL_SAMPLE = 40;
/** Citations alone never make the evidence airtight. */
const EVIDENCE_CAP = 90;

/**
 * How badly the market feels the winning problem.
 *
 * Severity alone is not enough — a problem many people rate as painful but
 * nobody will pay to fix is a complaint, not a market. Willingness to pay is
 * folded in directly rather than reported beside it.
 */
export function problemSeverityScore(crowd: CrowdVerdict): number {
  const winner = marketWinner(crowd);
  if (!winner || winner.votes === 0) return 0;

  const asked = crowd.reactions.length || 1;
  const reach = Math.min(1, winner.votes / (asked * 0.45));
  // Pay weighs three times what it did: a problem that hurts and that nobody
  // will pay to fix scored in the fifties, which is why every run did.
  return clamp(winner.meanSeverity * (0.25 + 0.75 * winner.payRate) * (0.45 + 0.55 * reach), 0, 100);
}

function marketWinner(crowd: CrowdVerdict) {
  return crowd.problemVotes.find((v) => v.problemId === crowd.marketProblemId);
}

/**
 * How much room there is. Derived from the council's own read of incumbents,
 * with the crowd's indifference as a correction: a market where most people
 * ignored the idea entirely has less gap than the council thinks, because the
 * incumbent that actually wins is "nothing".
 */
export function marketGapScore(councilVerdicts: AgentVerdict[], crowd: CrowdVerdict): number {
  if (councilVerdicts.length === 0) return 0;

  const mean =
    councilVerdicts.reduce((a, v) => a + v.stance * v.confidence, 0) /
    councilVerdicts.reduce((a, v) => a + v.confidence, 0);

  const base = (mean + 1) * 50;
  const asked = crowd.reactions.length || 1;
  const indifference = crowd.attention.ignore / asked;
  return clamp(base * (1 - indifference * 0.6), 0, 100);
}

/** The weighted council score for the hub actually being assessed. */
export function hubFitScore(councilVerdicts: AgentVerdict[], weights: WeightMap): number {
  if (councilVerdicts.length === 0) return 0;
  const w = normalizeWeights(weights);

  let num = 0;
  let den = 0;
  for (const v of councilVerdicts) {
    const mass = (w[v.agentId] ?? 0) * v.confidence;
    num += mass * v.stance;
    den += mass;
  }
  return den === 0 ? 0 : clamp(((num / den) + 1) * 50, 0, 100);
}

/**
 * What proportion of the council's claims are actually bound to something.
 *
 * This is the component that keeps the rest honest. Agents are told to cite
 * fields; claims with no citation are speculation, and a score built on
 * speculation should say so rather than quietly averaging it in.
 */
export function evidenceStrengthScore(councilVerdicts: AgentVerdict[], crowd?: CrowdVerdict): number {
  if (councilVerdicts.length === 0) return 0;
  const bound = councilVerdicts.filter((v) => v.evidence.length > 0).length;
  const citations = councilVerdicts.reduce((a, v) => a + v.evidence.length, 0);

  const coverage = bound / councilVerdicts.length;
  const depth = Math.min(1, citations / (councilVerdicts.length * 2));
  const cited = (coverage * 0.7 + depth * 0.3) * 100;
  if (!crowd) return clamp(cited, 0, EVIDENCE_CAP);

  // Every claim can cite "crowd.reactions"; what it cites is only as strong as
  // the number of people behind it. Citations alone put this near 95 on every
  // run and carried the total with it.
  const behind = marketWinner(crowd)?.votes ?? 0;
  const sample = Math.min(1, behind / FULL_SAMPLE);
  return clamp(cited * (0.3 + 0.7 * sample), 0, EVIDENCE_CAP);
}

/**
 * What the crowd says against the problem, taken off the total rather than
 * averaged in, so a weak signal cannot hide behind strong ones.
 */
export function pvsPenalties(crowd: CrowdVerdict): { reason: string; points: number }[] {
  const out: { reason: string; points: number }[] = [];
  const winner = marketWinner(crowd);

  if (winner && winner.votes > 0 && winner.payRate < PAY_FLOOR) {
    out.push({
      reason: `only ${Math.round(winner.payRate * 100)}% of the people who have it would pay to fix it`,
      points: Math.round((PAY_FLOOR - winner.payRate) * 40),
    });
  }
  if (crowd.mismatch) {
    out.push({ reason: "the problem you pitched is not the one the market has", points: 5 });
  }
  return out;
}

export function computePVS(
  crowd: CrowdVerdict,
  councilVerdicts: AgentVerdict[],
  weights: WeightMap
): PVSBreakdown {
  const problemSeverity = problemSeverityScore(crowd);
  const marketGap = marketGapScore(councilVerdicts, crowd);
  const hubFit = hubFitScore(councilVerdicts, weights);
  const evidenceStrength = evidenceStrengthScore(councilVerdicts, crowd);
  const penalties = pvsPenalties(crowd);

  const weighted =
    problemSeverity * PVS_WEIGHTS.problemSeverity +
    marketGap * PVS_WEIGHTS.marketGap +
    hubFit * PVS_WEIGHTS.hubFit +
    evidenceStrength * PVS_WEIGHTS.evidenceStrength;
  const total = clamp(weighted - penalties.reduce((a, p) => a + p.points, 0), 0, 100);

  return {
    total: Math.round(total),
    problemSeverity: Math.round(problemSeverity),
    marketGap: Math.round(marketGap),
    hubFit: Math.round(hubFit),
    evidenceStrength: Math.round(evidenceStrength),
    threshold: PVS_THRESHOLD,
    passed: total >= PVS_THRESHOLD,
    penalties,
  };
}

/**
 * The one reason the score is where it is, in words a founder can act on:
 * the biggest penalty if there is one, otherwise the weakest component.
 */
export function pvsReason(pvs: PVSBreakdown): string {
  const worst = [...(pvs.penalties ?? [])].sort((a, b) => b.points - a.points)[0];
  if (worst) return worst.reason;

  const parts: [number, string][] = [
    [pvs.problemSeverity, "the problem doesn't hurt enough for people to pay to fix it"],
    [pvs.marketGap, "there isn't much room left in this market"],
    [pvs.hubFit, "the council isn't sold on this city"],
    [pvs.evidenceStrength, "too few people back it up"],
  ];
  return parts.sort((a, b) => a[0] - b[0])[0][1];
}

/**
 * Which hub this problem lands best in, from crowd data alone. Cheap enough to
 * run for every hub without convening a council in each — the council is
 * reserved for the one the founder picks.
 */
export function rankHubs(
  crowd: CrowdVerdict,
  problem: ProblemStatement,
  personaHub: (personaId: number) => string | undefined
): { hubId: string; fitScore: number; asked: number; haveIt: number; wouldPay: number }[] {
  const byHub = new Map<string, { asked: number; haveIt: number; pay: number; severity: number }>();

  for (const r of crowd.reactions) {
    const hubId = personaHub(r.personaId);
    if (!hubId) continue;

    const row = byHub.get(hubId) ?? { asked: 0, haveIt: 0, pay: 0, severity: 0 };
    row.asked++;
    if (r.problemId === problem.id) {
      row.haveIt++;
      row.severity += r.problemSeverity;
      if (r.wouldPay) row.pay++;
    }
    byHub.set(hubId, row);
  }

  return [...byHub.entries()]
    .map(([hubId, row]) => {
      const incidence = row.asked ? row.haveIt / row.asked : 0;
      const payRate = row.haveIt ? row.pay / row.haveIt : 0;
      const meanSeverity = row.haveIt ? row.severity / row.haveIt : 0;
      return {
        hubId,
        // Incidence and willingness to pay both matter; severity breaks ties.
        fitScore: Math.round(
          clamp(incidence * 55 + payRate * 30 + (meanSeverity / 100) * 15, 0, 100)
        ),
        asked: row.asked,
        haveIt: row.haveIt,
        wouldPay: row.pay,
      };
    })
    // A hub where we asked almost nobody is not a finding.
    .filter((h) => h.asked >= 3)
    .sort((a, b) => b.fitScore - a.fitScore);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
