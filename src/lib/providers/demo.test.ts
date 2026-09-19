import { describe, expect, it } from "vitest";
import { DemoProvider } from "./demo";
import { MARKET_ANALYST, buildHubSystemPrompt, hubContext } from "@/lib/agents/hub/roster";
import { PERSONAS } from "@/data/personas";
import type { CrowdReaction, CrowdVerdict } from "@/lib/discovery/types";
import type { ProblemStatement } from "@/lib/types";

// The demo provider stands in for a model on stage when there is no key, so
// the things a judge can poke at have to behave like a model would.

const PROBLEM: ProblemStatement = {
  id: "p2",
  statement: "The people accountable cannot tell which part carries risk.",
  whoHasIt: "Leads and managers.",
  severity: 80,
  frequency: "Weekly",
  currentWorkaround: "Tribal knowledge.",
  willingnessToPay: "High",
  evidence: [],
  confidence: 0.7,
};

/** A crowd in which `share` of each listed city has the problem. */
function crowdFor(hubs: Record<string, number>): CrowdVerdict {
  const reactions: CrowdReaction[] = [];
  for (const [hubId, share] of Object.entries(hubs)) {
    const locals = PERSONAS.filter((p) => p.hubId === hubId).slice(0, 10);
    locals.forEach((p, i) => {
      const has = i < Math.round(share * locals.length);
      reactions.push({
        personaId: p.id,
        attention: has ? "full" : "ignore",
        sentiment: has ? 0.8 : 0.3,
        problemId: has ? "p2" : null,
        problemSeverity: has ? 80 : 0,
        wouldPay: has && i % 2 === 0,
        reason: "",
      });
    });
  }
  return {
    reactions,
    problemVotes: [],
    marketProblemId: "p2",
    pitchedProblemId: "p1",
    mismatch: true,
    attention: { full: 0, partial: 0, ignore: 0 },
    meanSentiment: 0.5,
    sentimentSpread: 0.2,
  };
}

describe("demo hub council", () => {
  const demo = new DemoProvider();
  const crowd = crowdFor({ sf: 0.9, lagos: 0.2 });
  const ask = (hubId: string, hubName: string, schema: string) =>
    demo.completeJSON<Record<string, number>>({
      system: buildHubSystemPrompt(MARKET_ANALYST, hubName),
      user: hubContext(hubId, hubName, PROBLEM, crowd),
      schema: { name: schema, schema: {} },
    });

  it("argues differently about a city where the problem is common", async () => {
    const [sf, lagos] = await Promise.all([
      ask("sf", "San Francisco", "agent_verdict"),
      ask("lagos", "Lagos", "agent_verdict"),
    ]);
    expect(sf.stance).toBeGreaterThan(lagos.stance);
  });

  it("keeps a change of mind the same size wherever it happens", async () => {
    const [sf, sfRebuttal, lagos, lagosRebuttal] = await Promise.all([
      ask("sf", "San Francisco", "agent_verdict"),
      ask("sf", "San Francisco", "rebuttal"),
      ask("lagos", "Lagos", "agent_verdict"),
      ask("lagos", "Lagos", "rebuttal"),
    ]);
    // Stances are rounded to the cent independently, so allow a cent of drift.
    const moved = (v: Record<string, number>, r: Record<string, number>) =>
      r.revisedStance - v.stance;
    expect(Math.abs(moved(sf, sfRebuttal) - moved(lagos, lagosRebuttal))).toBeLessThanOrEqual(0.011);
  });
});
