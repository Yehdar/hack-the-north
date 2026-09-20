import { describe, expect, it } from "vitest";
import { diagnoseNoMarket } from "./advice";
import type { CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";
import type { ProblemStatement } from "@/lib/types";

// Nobody claiming a problem is three different findings wearing one result,
// and the founder does something different in each case.

function crowd(mix: { full: number; partial: number; ignore: number; pay?: number }): CrowdVerdict {
  const reactions: CrowdReaction[] = [];
  const push = (attention: CrowdReaction["attention"], n: number) => {
    for (let i = 0; i < n; i++) {
      reactions.push({
        personaId: reactions.length + 1,
        attention,
        sentiment: attention === "ignore" ? 0.2 : 0.7,
        problemId: null,
        problemSeverity: 0,
        wouldPay: reactions.length < (mix.pay ?? 0),
        reason: "",
      });
    }
  };
  push("full", mix.full);
  push("partial", mix.partial);
  push("ignore", mix.ignore);

  return {
    reactions,
    problemVotes: [],
    marketProblemId: null,
    pitchedProblemId: "p1",
    mismatch: false,
    attention: { full: mix.full, partial: mix.partial, ignore: mix.ignore },
    meanSentiment: 0.5,
    sentimentSpread: 0.2,
  };
}

const PITCHED = {
  id: "p1",
  statement: "There is no tool that reconciles invoices across three ERPs.",
  whoHasIt: "Finance teams",
  currentWorkaround: "Spreadsheets and a week of overtime.",
  severity: 40,
  frequency: "Monthly",
  willingnessToPay: "Not much.",
  confidence: 0.8,
} as ProblemStatement;

describe("nobody has this problem", () => {
  it("reads a room that read it and shrugged as already solved", () => {
    const d = diagnoseNoMarket(crowd({ full: 20, partial: 70, ignore: 30 }), PITCHED);

    expect(d.kind).toBe("solved");
    expect(d.evidence).toMatch(/90 read it/);
    expect(d.instead).toBe("Spreadsheets and a week of overtime.");
    expect(d.action).toMatch(/last time it failed/);
  });

  it("reads a room that ignored it as early, or the wrong room", () => {
    const d = diagnoseNoMarket(crowd({ full: 10, partial: 20, ignore: 70 }), PITCHED);

    expect(d.kind).toBe("early");
    expect(d.evidence).toMatch(/70%/);
    expect(d.action).toMatch(/whose week this ruins/);
  });

  it("reads interest with no problem behind it as a preference", () => {
    const d = diagnoseNoMarket(crowd({ full: 60, partial: 30, ignore: 30, pay: 25 }), PITCHED);

    expect(d.kind).toBe("preference");
    expect(d.headline).toMatch(/do not need it/);
    expect(d.action).toMatch(/already paying to solve badly/);
  });

  it("says something even with nothing to go on", () => {
    const d = diagnoseNoMarket(crowd({ full: 0, partial: 0, ignore: 0 }));

    expect(d.headline).toBeTruthy();
    expect(d.action).toBeTruthy();
    expect(d.instead).toBeUndefined();
  });
});
