import type { AgentId, AgentVerdict, ICVerdict, Objection } from "@/lib/types";

// ============================================================================
// WEIGHTED VERDICT — pure functions only. Track B owns this file.
//
// No async, no fetch, no model calls. Moving a weight slider re-runs all of
// this synchronously on cached votes. If anything here ever needs to await,
// the design is wrong.
// ============================================================================

export type WeightMap = Record<AgentId, number>;

/** Stance divergence beyond this marks an agent as a dissenter. */
export const DISSENT_THRESHOLD = 0.6;
/** Score cost of each objection the founder left unanswered or dodged. */
export const OBJECTION_PENALTY = 0.08;
export const INVEST_AT = 0.35;
export const PASS_BELOW = -0.1;

export function normalizeWeights(weights: WeightMap): WeightMap {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const ids = Object.keys(weights);
    const even = ids.length > 0 ? 1 / ids.length : 0;
    return Object.fromEntries(ids.map((id) => [id, even]));
  }
  return Object.fromEntries(
    Object.entries(weights).map(([id, w]) => [id, w / total])
  );
}

/**
 * Confidence-weighted mean stance, penalized for unresolved objections.
 *
 * Confidence weighting matters: a 50%-weight GP who admits low confidence
 * should not steamroll a 20%-weight Skeptic who is certain.
 */
export function computeScore(
  votes: AgentVerdict[],
  weights: WeightMap,
  unansweredObjections = 0
): number {
  const w = normalizeWeights(weights);
  let numerator = 0;
  let denominator = 0;

  for (const v of votes) {
    const weight = w[v.agentId] ?? 0;
    const mass = weight * v.confidence;
    numerator += mass * v.stance;
    denominator += mass;
  }

  const base = denominator === 0 ? 0 : numerator / denominator;
  const penalized = base - OBJECTION_PENALTY * unansweredObjections;
  return clamp(penalized, -1, 1);
}

/**
 * Agents whose position diverged sharply from where the room landed.
 * Always surfaced, never averaged away — a lone hard no from the Skeptic is
 * the single most useful thing this app produces.
 */
export function detectDissents(votes: AgentVerdict[], score: number): AgentId[] {
  return votes
    .filter((v) => Math.abs(v.stance - score) > DISSENT_THRESHOLD)
    .map((v) => v.agentId);
}

export function decide(score: number): ICVerdict["decision"] {
  if (score >= INVEST_AT) return "invest";
  if (score < PASS_BELOW) return "pass";
  return "conditional";
}

export function countUnanswered(objections: Objection[]): number {
  return objections.filter((o) => o.status !== "answered").length;
}

/**
 * The kill shot: the objection from the most-divergent negative voice that the
 * founder never answered. Undefined if they cleared everything.
 */
export function findKillShot(
  objections: Objection[],
  votes: AgentVerdict[]
): string | undefined {
  const unresolved = objections.filter((o) => o.status !== "answered");
  if (unresolved.length === 0) return undefined;

  const stanceBySeat = new Map(votes.map((v) => [v.agentId, v.stance]));
  const sorted = [...unresolved].sort(
    (a, b) => (stanceBySeat.get(a.seatId) ?? 0) - (stanceBySeat.get(b.seatId) ?? 0)
  );
  return sorted[0]?.text;
}

export function buildVerdict(
  votes: AgentVerdict[],
  weights: WeightMap,
  objections: Objection[],
  conditions: string[],
  comeBackWhen: string
): ICVerdict {
  const unanswered = countUnanswered(objections);
  const score = computeScore(votes, weights, unanswered);

  return {
    decision: decide(score),
    score,
    seatVotes: votes,
    conditions,
    comeBackWhen,
    killShot: findKillShot(objections, votes),
    dissents: detectDissents(votes, score),
  };
}

/** Spread of opinion in the room. Near zero means the agents collapsed into
 *  one voice — which is a bug in the priors, not a real consensus. */
export function stanceVariance(votes: AgentVerdict[]): number {
  if (votes.length < 2) return 0;
  const mean = votes.reduce((a, v) => a + v.stance, 0) / votes.length;
  const variance =
    votes.reduce((a, v) => a + (v.stance - mean) ** 2, 0) / votes.length;
  return Math.sqrt(variance);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
