import { describe, expect, it } from "vitest";
import { PERSONAS, selectRelevant } from "@/data/personas";
import { aggregate, runCrowd } from "./crowd";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdReaction } from "./types";

const PROBLEMS: ProblemStatement[] = ["p1", "p2", "p3"].map((id, i) => ({
  id,
  statement: `Problem ${id}`,
  whoHasIt: "Someone",
  severity: 50 + i * 10,
  frequency: "Weekly",
  currentWorkaround: "None",
  willingnessToPay: "Some",
  evidence: [],
  confidence: 0.7,
}));

function reaction(over: Partial<CrowdReaction> & { personaId: number }): CrowdReaction {
  return {
    attention: "partial",
    sentiment: 0.5,
    problemId: null,
    problemSeverity: 0,
    wouldPay: false,
    reason: "",
    ...over,
  };
}

describe("crowd aggregation", () => {
  it("ranks by weight of feeling, not headcount alone", () => {
    // p1 has more bodies; p2 has fewer people who hurt more and would pay.
    const reactions = [
      ...Array.from({ length: 30 }, (_, i) =>
        reaction({ personaId: i, problemId: "p1", problemSeverity: 25, wouldPay: false })
      ),
      ...Array.from({ length: 14 }, (_, i) =>
        reaction({ personaId: 100 + i, problemId: "p2", problemSeverity: 92, wouldPay: true })
      ),
    ];

    const verdict = aggregate(reactions, PROBLEMS);
    expect(verdict.marketProblemId).toBe("p2");
  });

  it("detects the mismatch between what was pitched and what the market has", () => {
    const reactions = Array.from({ length: 20 }, (_, i) =>
      reaction({ personaId: i, problemId: "p3", problemSeverity: 80, wouldPay: true })
    );
    const verdict = aggregate(reactions, PROBLEMS);

    expect(verdict.pitchedProblemId).toBe("p1");
    expect(verdict.marketProblemId).toBe("p3");
    expect(verdict.mismatch).toBe(true);
  });

  it("reports no mismatch when the founder was right", () => {
    const reactions = Array.from({ length: 20 }, (_, i) =>
      reaction({ personaId: i, problemId: "p1", problemSeverity: 80, wouldPay: true })
    );
    expect(aggregate(reactions, PROBLEMS).mismatch).toBe(false);
  });

  it("treats a crowd with none of these problems as a finding, not a crash", () => {
    const reactions = Array.from({ length: 10 }, (_, i) =>
      reaction({ personaId: i, problemId: null, attention: "ignore" })
    );
    const verdict = aggregate(reactions, PROBLEMS);
    expect(verdict.marketProblemId).toBeNull();
    expect(verdict.mismatch).toBe(false);
    expect(verdict.attention.ignore).toBe(10);
  });
});

describe("the crowd actually runs", () => {
  // No key in test, so this exercises the demo provider. Which computes
  // reactions from each persona's real attributes rather than returning canned
  // text. That makes these assertions meaningful rather than tautological.
  it("returns exactly one reaction per persona, batching included", async () => {
    const personas = selectRelevant("A developer tool for testing code.", { limit: 45 }).map(
      (h) => h.persona
    );
    const reactions = await runCrowd("A developer tool for testing code.", PROBLEMS, personas);

    expect(reactions).toHaveLength(45);
    expect(new Set(reactions.map((r) => r.personaId)).size).toBe(45);
  });

  it("produces a crowd that disagrees with itself", async () => {
    const personas = selectRelevant("An AI tool that writes unit tests.", { limit: 60 }).map(
      (h) => h.persona
    );
    const reactions = await runCrowd("An AI tool that writes unit tests.", PROBLEMS, personas);
    const verdict = aggregate(reactions, PROBLEMS);

    // A crowd that all feels the same way has been flattered, not surveyed.
    expect(verdict.sentimentSpread).toBeGreaterThan(0.05);

    // And they should not all land on the same problem.
    const picked = new Set(reactions.map((r) => r.problemId).filter(Boolean));
    expect(picked.size).toBeGreaterThan(1);
  }, 30000);

  it("streams progress as batches land", async () => {
    const personas = PERSONAS.slice(0, 40);
    const seen: number[] = [];
    await runCrowd("Anything.", PROBLEMS, personas, (p) => seen.push(p.done));

    expect(seen.length).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBe(40);
  }, 30000);
});
