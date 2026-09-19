import { describe, expect, it } from "vitest";
import { writeMinutes } from "./minutes";
import type { DeliberationSnapshot } from "./store";
import type { AgentVerdict, ICVerdict, Objection } from "./types";

function verdict(agentId: string, stance: number, position: string): AgentVerdict {
  return {
    agentId,
    stance,
    confidence: 0.7,
    position,
    reasoning: "",
    evidence: [],
    whatWouldChangeMyMind: "",
  } as AgentVerdict;
}

const SNAPSHOT: DeliberationSnapshot = {
  firm: "Bessemer Venture Partners",
  roster: [
    { id: "gp", role: "Lead Partner", weight: 0.5 },
    { id: "principal", role: "Principal", weight: 0.3 },
    { id: "skeptic", role: "Skeptical Partner", weight: 0.2 },
  ],
  verdicts: [
    verdict("gp", 0.1, "I like the problem. What I can't see is a company."),
    verdict("principal", -0.2, "Nobody has paid yet. That's the whole question."),
    verdict("skeptic", -0.55, "I've seen this movie."),
  ],
  messages: [
    { id: "m1", round: 2, from: "principal", to: "gp", kind: "challenge", text: "Real for whom? Who pays?" },
    { id: "m2", round: 2, from: "skeptic", to: "gp", kind: "challenge", text: "Which moment does it own?" },
    { id: "m3", round: 3, from: "gp", to: "principal", kind: "concession", text: "Fair." },
    { id: "m4", round: 3, from: "gp", to: "skeptic", kind: "rebuttal", text: "It owns the morning." },
  ],
  metrics: {
    challenges: 2,
    rebuttals: 1,
    concessions: 1,
    convergence: 0.1,
    varianceByRound: [0.4, 0.3],
    mindChanges: [{ agentId: "gp", from: 0.4, to: 0.1, conceded: true }],
  },
};

const DECISION: ICVerdict = {
  decision: "conditional",
  score: -0.05,
  seatVotes: SNAPSHOT.verdicts,
  conditions: ["Three customers who paid."],
  comeBackWhen: "You have paying design partners.",
  dissents: ["skeptic"],
};

describe("the minutes", () => {
  const minutes = writeMinutes({ firm: SNAPSHOT.firm, snapshot: SNAPSHOT, verdict: DECISION, now: 0 });

  it("records who was in the room, chair included", () => {
    expect(minutes.present.map((p) => p.role)).toEqual([
      "Lead Partner",
      "Principal",
      "Skeptical Partner",
      "Managing Partner (chair)",
    ]);
    expect(minutes.keptBy).toBe("Managing Partner (chair)");
  });

  it("gives each partner's view and says who moved", () => {
    const gp = minutes.views.find((v) => v.role === "Lead Partner")!;
    expect(gp.view).toBe("I like the problem.");
    expect(gp.moved).toBe("Moved from leaning yes to undecided, and conceded the point.");
    expect(minutes.views.find((v) => v.role === "Skeptical Partner")!.lean).toBe("against");
  });

  it("lists only the challenges that were held, plus standing dissent", () => {
    expect(minutes.disagreements.join(" ")).toMatch(/Skeptical Partner challenged Lead Partner/);
    expect(minutes.disagreements.join(" ")).not.toMatch(/Principal challenged/);
    expect(minutes.disagreements.join(" ")).toMatch(/dissented/);
  });

  it("before the pitch, the next step is to pitch", () => {
    expect(minutes.nextSteps[0]).toMatch(/Pitch the partners/);
    expect(minutes.nextSteps).toContain("Come back when you have paying design partners.");
    expect(minutes.pitch).toBeUndefined();
  });

  it("after the pitch, the next steps are the questions left open", () => {
    const objections: Objection[] = [
      { id: "o1", seatId: "principal", text: "No paying customer named", type: "unsupported-claim", status: "open", raisedAtTurn: 1 },
      { id: "o2", seatId: "skeptic", text: "Retention", type: "dodged", status: "answered", raisedAtTurn: 2 },
    ];
    const after = writeMinutes({ firm: SNAPSHOT.firm, snapshot: SNAPSHOT, verdict: DECISION, objections, pitchTurns: 3 });

    expect(after.pitch).toEqual({ turns: 3, answered: 1, open: ["No paying customer named"] });
    expect(after.nextSteps[0]).toBe("Come back with an answer to: No paying customer named.");
  });
});
