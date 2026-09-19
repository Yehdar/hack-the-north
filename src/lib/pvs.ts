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
  problemSeverity: 0.3,
  marketGap: 0.3,
  hubFit: 0.25,
  evidenceStrength: 0.15,
} as const;

/**
 * How badly the market feels the winning problem.
 *
 * Severity alone is not enough — a problem many people rate as painful but
 * nobody will pay to fix is a complaint, not a market. Willingness to pay is
 * folded in directly rather than reported beside it.
 */
export function problemSeverityScore(crowd: CrowdVerdict): number {
  const winner = crowd.problemVotes.find((v) => v.problemId === crowd.marketProblemId);
  if (!winner || winner.votes === 0) return 0;

  const asked = crowd.reactions.length || 1;
  const reach = Math.min(1, winner.votes / (asked * 0.45));
  return clamp(winner.meanSeverity * (0.45 + 0.55 * winner.payRate) * (0.55 + 0.45 * reach), 0, 100);
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
export function evidenceStrengthScore(councilVerdicts: AgentVerdict[]): number {
  if (councilVerdicts.length === 0) return 0;
  const bound = councilVerdicts.filter((v) => v.evidence.length > 0).length;
  const citations = councilVerdicts.reduce((a, v) => a + v.evidence.length, 0);

  const coverage = bound / councilVerdicts.length;
  const depth = Math.min(1, citations / (councilVerdicts.length * 2));
  return clamp((coverage * 0.7 + depth * 0.3) * 100, 0, 100);
}

export function computePVS(
  crowd: CrowdVerdict,
  councilVerdicts: AgentVerdict[],
  weights: WeightMap
): PVSBreakdown {
  const problemSeverity = problemSeverityScore(crowd);
  const marketGap = marketGapScore(councilVerdicts, crowd);
  const hubFit = hubFitScore(councilVerdicts, weights);
  const evidenceStrength = evidenceStrengthScore(councilVerdicts);

  const total =
    problemSeverity * PVS_WEIGHTS.problemSeverity +
    marketGap * PVS_WEIGHTS.marketGap +
    hubFit * PVS_WEIGHTS.hubFit +
    evidenceStrength * PVS_WEIGHTS.evidenceStrength;

  return {
    total: Math.round(total),
    problemSeverity: Math.round(problemSeverity),
    marketGap: Math.round(marketGap),
    hubFit: Math.round(hubFit),
    evidenceStrength: Math.round(evidenceStrength),
    threshold: PVS_THRESHOLD,
    passed: total >= PVS_THRESHOLD,
  };
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
