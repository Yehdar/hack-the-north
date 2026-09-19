import { describe, expect, it } from "vitest";
import { assess, explainVerdict } from "./advice";
import type { CrowdVerdict, CrowdReaction } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import type { ICVerdict, Objection } from "@/lib/types";

function reaction(over: Partial<CrowdReaction> & { personaId: number }): CrowdReaction {
  return {
    attention: "partial",
    sentiment: 0.5,
    problemId: "p1",
    problemSeverity: 60,
    wouldPay: false,
    reason: "",
    ...over,
  };
}

function crowdOf(reactions: CrowdReaction[], over: Partial<CrowdVerdict> = {}): CrowdVerdict {
  const attention = { full: 0, partial: 0, ignore: 0 };
  for (const r of reactions) attention[r.attention]++;
  const mine = reactions.filter((r) => r.problemId === "p1");
  return {
    reactions,
    problemVotes: [
      {
        problemId: "p1",
        votes: mine.length,
        meanSeverity: mine.length
          ? mine.reduce((a, r) => a + r.problemSeverity, 0) / mine.length
          : 0,
        payRate: mine.length ? mine.filter((r) => r.wouldPay).length / mine.length : 0,
      },
    ],
    marketProblemId: "p1",
    pitchedProblemId: "p1",
    mismatch: false,
    attention,
    meanSentiment: 0.5,
    sentimentSpread: 0.2,
    ...over,
  };
}

const NO_SIGNALS: CrowdSignals = {
  engaged: 0,
  ignored: 0,
  signals: [],
  positives: [],
  negatives: [],
  warning: null,
};

describe("assess", () => {
  it("fails an idea nobody will pay for, however much they like it", () => {
    const reactions = Array.from({ length: 40 }, (_, i) =>
      reaction({ personaId: i, attention: "full", sentiment: 0.9, wouldPay: false })
    );
    const a = assess(crowdOf(reactions), NO_SIGNALS);

    expect(a.verdict).toBe("fail");
    expect(a.findings[0].severity).toBe("fatal");
    // The advice must quote the measurement, not restate the problem.
    expect(a.findings[0].evidence).toMatch(/0 of 40/);
  });

  it("fails an idea most people ignored", () => {
    const reactions = Array.from({ length: 40 }, (_, i) =>
      reaction({ personaId: i, attention: i < 25 ? "ignore" : "full", wouldPay: i >= 25 })
    );
    const a = assess(crowdOf(reactions), NO_SIGNALS);
    expect(a.verdict).toBe("fail");
    expect(a.findings.some((f) => /ignored you outright/.test(f.headline))).toBe(true);
  });

  it("does not hand out a strong verdict easily", () => {
    // Genuinely good: most engaged, most would pay, severe problem.
    const reactions = Array.from({ length: 40 }, (_, i) =>
      reaction({ personaId: i, attention: "full", wouldPay: true, problemSeverity: 85 })
    );
    const a = assess(crowdOf(reactions), NO_SIGNALS, {
      total: 78,
      problemSeverity: 85,
      marketGap: 70,
      hubFit: 75,
      evidenceStrength: 80,
      threshold: 60,
      passed: true,
    });
    expect(a.verdict).toBe("strong");
  });

  it("every finding says what to do, not just what is wrong", () => {
    const reactions = Array.from({ length: 30 }, (_, i) =>
      reaction({ personaId: i, attention: "ignore", wouldPay: false, problemSeverity: 20 })
    );
    const a = assess(crowdOf(reactions), NO_SIGNALS);
    for (const f of a.findings) {
      expect(f.action.length).toBeGreaterThan(40);
      expect(f.evidence.length).toBeGreaterThan(10);
    }
  });

  it("calls out a mismatch with both sides' numbers", () => {
    const reactions = Array.from({ length: 30 }, (_, i) =>
      reaction({ personaId: i, wouldPay: true, attention: "full" })
    );
    const a = assess(
      crowdOf(reactions, { mismatch: true, pitchedProblemId: "p9" }),
      NO_SIGNALS
    );
    expect(a.findings.some((f) => /wrong problem/.test(f.headline))).toBe(true);
  });
});

describe("explainVerdict", () => {
  const roster = [
    { id: "gp", role: "General Partner" },
    { id: "skeptic", role: "Anti-Portfolio Skeptic" },
  ];

  const votes = [
    { agentId: "gp", stance: 0.2, confidence: 0.7, position: "Market could work.", reasoning: "", evidence: [], whatWouldChangeMyMind: "Revenue." },
    { agentId: "skeptic", stance: -0.8, confidence: 0.9, position: "This is a feature.", reasoning: "", evidence: [], whatWouldChangeMyMind: "A moat." },
  ];

  it("names the seat that blocked a pass, and what reopens it", () => {
    const v: ICVerdict = {
      decision: "pass", score: -0.3, seatVotes: votes,
      conditions: [], comeBackWhen: "later", dissents: [],
    };
    const e = explainVerdict(v, [], roster);
    expect(e.because).toContain("Anti-Portfolio Skeptic");
    expect(e.toReopen).toBe("A moat.");
  });

  it("treats a dodged question as the reason, not a footnote", () => {
    const objections: Objection[] = [
      { id: "o1", seatId: "principal", text: "Who signs for this?", type: "unit-economics", status: "dodged", raisedAtTurn: 2 },
    ];
    const v: ICVerdict = {
      decision: "conditional", score: 0.1, seatVotes: votes,
      conditions: ["Show a signed pilot"], comeBackWhen: "x", dissents: [],
    };
    const e = explainVerdict(v, objections, roster);
    expect(e.headline).toMatch(/not a yes/);
    expect(e.because).toContain("dodged");
    expect(e.because).toContain("Who signs for this?");
  });
});
