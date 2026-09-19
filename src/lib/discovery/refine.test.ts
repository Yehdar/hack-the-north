import { describe, expect, it } from "vitest";
import { selectByIds, selectRelevant } from "@/data/personas";
import { diffSessions, summariseCrowd, type SessionSummary } from "@/lib/sessions";
import { aggregate, runCrowd } from "./crowd";
import { extractProblems } from "./problems";
import { refinePitch } from "./refine";
import { analyseSignals } from "./signals";

// The refine loop, end to end, on the demo provider (no key in test). These
// assertions are about the mechanism, not canned text: the second run asks the
// same people about the same problems, so anything that moves was moved by the
// rewritten pitch.

const SOLUTION = "An AI tool that plugs into your repo and writes unit tests for untested code.";

function summary(
  id: string,
  solution: string,
  v: ReturnType<typeof aggregate>,
  problems: { id: string; statement: string }[],
  crowd: number,
  parentId?: string
): SessionSummary {
  return {
    id,
    createdAt: 0,
    updatedAt: 0,
    solution,
    parentId,
    ...summariseCrowd(v, analyseSignals(v.reactions), problems, crowd),
  } as SessionSummary;
}

describe("the refine loop", () => {
  it("states the founder's framing as a sentence, not a fragment", async () => {
    const [pitched] = await extractProblems(SOLUTION);
    expect(pitched.statement).toBe(
      "Teams have no AI tool that plugs into your repo and writes unit tests for untested code."
    );
  });

  it("aligns the market with the pitch once the pitch names the market's problem", async () => {
    const problems = await extractProblems(SOLUTION);
    const crowd = selectRelevant(SOLUTION, { limit: 120 }).map((h) => h.persona);

    const first = aggregate(await runCrowd(SOLUTION, problems, crowd), problems);
    expect(first.mismatch).toBe(true);
    const market = problems.find((p) => p.id === first.marketProblemId)!;

    // Same product, pointed at the market's problem.
    const rewritten = await refinePitch(SOLUTION, market);
    expect(rewritten.startsWith(SOLUTION.replace(/\.$/, ""))).toBe(true);
    expect(rewritten.length).toBeGreaterThan(SOLUTION.length);

    // Same people, same problems — the adopted problem now leads.
    const reordered = [market, ...problems.filter((p) => p.id !== market.id)];
    const sameCrowd = selectByIds(rewritten, crowd.map((p) => p.id)).map((h) => h.persona);
    expect(sameCrowd.map((p) => p.id)).toEqual(crowd.map((p) => p.id));

    const second = aggregate(await runCrowd(rewritten, reordered, sameCrowd), reordered);
    expect(second.pitchedProblemId).toBe(market.id);
    expect(second.marketProblemId).toBe(market.id);
    expect(second.mismatch).toBe(false);

    // The buyers heard their own problem named, and the crowd warmed to it.
    // Payers are counted rather than taken as a rate: a warmer pitch also
    // reaches marginal buyers, which can dilute the rate while adding payers.
    expect(second.meanSentiment).toBeGreaterThan(first.meanSentiment);
    const payers = (v: typeof first) => {
      const vote = v.problemVotes.find((x) => x.problemId === market.id)!;
      return Math.round(vote.votes * vote.payRate);
    };
    expect(payers(second)).toBeGreaterThan(payers(first));

    const before = summary("a", SOLUTION, first, problems, crowd.length);
    const after = summary("b", rewritten, second, reordered, sameCrowd.length, "a");
    const deltas = diffSessions(before, after);

    const alignment = deltas.find((d) => d.field === "Pitched vs market");
    expect(alignment).toMatchObject({ before: "mismatched", after: "aligned", better: true });
    expect(deltas.find((d) => d.field === "Mean sentiment")?.better).toBe(true);
  }, 30000);
});
