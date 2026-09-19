import { describe, expect, it } from "vitest";
import { computePVS, evidenceStrengthScore, pvsPenalties, pvsReason, PVS_THRESHOLD } from "./pvs";
import { aggregate } from "@/lib/discovery/aggregate";
import type { CrowdReaction } from "@/lib/discovery/types";
import type { AgentVerdict, ProblemStatement } from "@/lib/types";

const PROBLEMS = [
  { id: "p1", statement: "What the founder pitched" },
  { id: "p2", statement: "What the market has" },
] as ProblemStatement[];

/** A crowd of `asked` people, `have` of whom have `problemId`, `pay` of those
 *  would pay, at `severity`. Everyone else has none of the problems. */
function crowd(opts: { asked: number; have: number; pay: number; severity: number; problemId?: string }) {
  const reactions: CrowdReaction[] = Array.from({ length: opts.asked }, (_, i) => {
    const has = i < opts.have;
    return {
      personaId: i + 1,
      attention: has ? "full" : "ignore",
      sentiment: has ? 0.7 : 0.3,
      problemId: has ? (opts.problemId ?? "p1") : null,
      problemSeverity: has ? opts.severity : 0,
      wouldPay: has && i < opts.pay,
      reason: "",
    };
  });
  return aggregate(reactions, PROBLEMS);
}

function council(stance: number, citations = 2): AgentVerdict[] {
  return ["market", "founder", "customer", "regulatory", "capital"].map((agentId) => ({
    agentId,
    stance,
    confidence: 0.7,
    position: "",
    reasoning: "",
    evidence: Array.from({ length: citations }, (_, i) => `crowd.field${i}`),
    whatWouldChangeMyMind: "",
  })) as AgentVerdict[];
}

const WEIGHTS = { market: 1, founder: 1, customer: 1, regulatory: 1, capital: 1 };

describe("problem validation score", () => {
  it("stays pure: the same inputs give the same score", () => {
    const c = crowd({ asked: 120, have: 40, pay: 20, severity: 70 });
    expect(computePVS(c, council(0.2), WEIGHTS)).toEqual(computePVS(c, council(0.2), WEIGHTS));
  });

  it("does not land near 60 whatever the crowd said", () => {
    const strong = computePVS(crowd({ asked: 120, have: 70, pay: 60, severity: 85 }), council(0.5), WEIGHTS);
    const weak = computePVS(crowd({ asked: 120, have: 15, pay: 1, severity: 45 }), council(-0.2), WEIGHTS);

    expect(strong.passed).toBe(true);
    expect(weak.passed).toBe(false);
    expect(strong.total - weak.total).toBeGreaterThan(35);
  });

  it("discounts evidence that only a handful of people stand behind", () => {
    const few = evidenceStrengthScore(council(0.2), crowd({ asked: 120, have: 6, pay: 3, severity: 70 }));
    const many = evidenceStrengthScore(council(0.2), crowd({ asked: 120, have: 60, pay: 30, severity: 70 }));

    expect(few).toBeLessThan(50);
    expect(many).toBeGreaterThan(few);
    // Citations alone never make it airtight.
    expect(many).toBeLessThanOrEqual(90);
  });

  it("takes points off when almost nobody would pay", () => {
    const c = crowd({ asked: 120, have: 40, pay: 2, severity: 80 });
    const penalties = pvsPenalties(c);

    expect(penalties.map((p) => p.reason).join()).toMatch(/would pay/);
    expect(computePVS(c, council(0.3), WEIGHTS).penalties?.length).toBeGreaterThan(0);
  });

  it("takes points off when the market has a different problem from the one pitched", () => {
    const aligned = crowd({ asked: 120, have: 40, pay: 20, severity: 70, problemId: "p1" });
    const mismatched = crowd({ asked: 120, have: 40, pay: 20, severity: 70, problemId: "p2" });

    expect(mismatched.mismatch).toBe(true);
    expect(computePVS(mismatched, council(0.2), WEIGHTS).total).toBe(
      computePVS(aligned, council(0.2), WEIGHTS).total - 5
    );
  });

  it("says why, in words, leading with the biggest penalty", () => {
    const pvs = computePVS(crowd({ asked: 120, have: 40, pay: 1, severity: 80, problemId: "p2" }), council(0.3), WEIGHTS);

    expect(pvs.total).toBeLessThan(PVS_THRESHOLD);
    expect(pvsReason(pvs)).toMatch(/would pay/);
  });
});
