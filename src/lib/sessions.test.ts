import { beforeEach, describe, expect, it } from "vitest";
import { diffSessions, recordVerdict, useSessions, type SessionSummary } from "./sessions";

const base: SessionSummary = {
  id: "a",
  createdAt: 0,
  updatedAt: 0,
  solution: "A tool.",
  crowdSize: 120,
  problemCount: 4,
  pitchedProblem: "Teams have no tool.",
  marketProblem: "Leads cannot see risk.",
  mismatch: true,
  meanSentiment: 0.7,
  engaged: 40,
  warning: null,
  pvs: 60,
  decision: "pass",
};

describe("diffing two runs", () => {
  it("reports only what moved, and which way is better", () => {
    const next = { ...base, id: "b", mismatch: false, meanSentiment: 0.8, pvs: 66, decision: "conditional" as const };
    const byField = Object.fromEntries(diffSessions(base, next).map((d) => [d.field, d]));

    expect(byField["Pitched vs market"]).toMatchObject({ before: "mismatched", after: "aligned", better: true });
    expect(byField["Mean sentiment"].better).toBe(true);
    expect(byField["Validation score"]).toMatchObject({ before: "60", after: "66", better: true });
    expect(byField["Committee"]).toMatchObject({ before: "pass", after: "conditional", better: true });
    expect(byField["Paid full attention"]).toBeUndefined();
  });

  it("says nothing when nothing moved", () => {
    expect(diffSessions(base, { ...base, id: "b" })).toEqual([]);
  });
});

describe("recording a committee verdict", () => {
  beforeEach(() => useSessions.getState().clear());

  it("lands on the active run when it is the idea being pitched", () => {
    const id = useSessions.getState().begin("A tool.");
    recordVerdict("A tool.", { decision: "invest", score: 0.4 });
    expect(useSessions.getState().sessions.find((s) => s.id === id)?.decision).toBe("invest");
  });

  it("never overwrites a run about a different idea", () => {
    const id = useSessions.getState().begin("A tool.");
    recordVerdict("Something else entirely.", { decision: "pass" });
    expect(useSessions.getState().sessions.find((s) => s.id === id)?.decision).toBeUndefined();
  });
});
