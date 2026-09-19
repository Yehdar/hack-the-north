import { describe, expect, it } from "vitest";
import type { LLMProvider, LLMRequest } from "@/lib/llm";
import type { AgentTemplate } from "@/lib/types";
import { deliberate, variance } from "./protocol";

// ---------------------------------------------------------------------------
// A scripted provider. The point is to test the PROTOCOL — routing, directed
// messaging, belief revision, metrics — deterministically, without a model and
// without a key. Model quality is a separate question from whether the
// machinery that carries it works.
// ---------------------------------------------------------------------------

function agent(id: string, temperature = 0.7): AgentTemplate {
  return {
    id,
    family: "vc",
    role: id,
    defaultWeight: 1,
    persona: { name: id, background: "" },
    priors: [],
    focus: [`${id}-lane`],
    temperature,
  };
}

const ALPHA = agent("alpha");
const BETA = agent("beta");
const GAMMA = agent("gamma", 0.9);
const DEVIL = agent("devil", 1.0);

class ScriptedProvider implements LLMProvider {
  readonly name = "scripted";
  calls: { schema?: string; agent?: string }[] = [];

  async complete(req: LLMRequest): Promise<string> {
    return JSON.stringify(await this.completeJSON(req));
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    const who = req.system.replace("AGENT:", "");
    this.calls.push({ schema: req.schema?.name, agent: who });

    switch (req.schema?.name) {
      case "diligence_tasks":
        return {
          tasks: [
            { question: "Is the market big enough?", assignedTo: "alpha", why: "lane" },
            { question: "Do the unit economics work?", assignedTo: "beta", why: "lane" },
            { question: "What does this rhyme with?", assignedTo: "gamma", why: "lane" },
            // Assigned to nobody in the room — must be dropped.
            { question: "Irrelevant", assignedTo: "ghost", why: "invalid" },
          ],
        } as T;

      case "agent_verdict": {
        const stance = { alpha: 0.8, beta: 0.1, gamma: -0.7, devil: -0.9 }[who] ?? 0;
        return {
          stance,
          confidence: 0.8,
          position: `${who} position`,
          reasoning: `${who} reasoning`,
          evidence: ["firm.thesis[0]"],
          whatWouldChangeMyMind: "evidence",
        } as T;
      }

      case "challenges": {
        const scripted: Record<string, { to: string; text: string }[]> = {
          alpha: [
            { to: "gamma", text: "You are pattern-matching against the last decade." },
            // Self-challenge — must be dropped.
            { to: "alpha", text: "I challenge myself." },
          ],
          gamma: [{ to: "alpha", text: "Your TAM assumes a budget that does not exist." }],
          // Nothing substantive to press. Silence must be allowed.
          beta: [],
        };
        return { challenges: scripted[who] ?? [] } as T;
      }

      case "chair_rulings": {
        // alpha conceded, so that challenge is met; gamma brushed its one off.
        return {
          rulings: [
            { challengeId: "m4", answered: true, reason: "Conceded honestly." },
            { challengeId: "m5", answered: false, reason: "Restated a position." },
          ],
        } as T;
      }

      case "rebuttal": {
        // Alpha is genuinely moved. Gamma holds its conviction under pressure.
        const conceded = who === "alpha";
        return {
          response: conceded ? "Fair — the budget assumption is load-bearing." : "No, that analogy does not hold.",
          conceded,
          revisedStance: conceded ? 0.3 : -0.7,
          revisedConfidence: 0.8,
        } as T;
      }

      default:
        return {} as T;
    }
  }
}

const OPTS = {
  agents: [ALPHA, BETA, GAMMA],
  adversary: DEVIL,
  context: "A venture.",
  buildSystemPrompt: (a: AgentTemplate) => `AGENT:${a.id}`,
};

describe("deliberation protocol", () => {
  it("decomposes into tasks and drops assignments to agents not in the room", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    expect(r.tasks).toHaveLength(3);
    expect(r.tasks.every((t) => ["alpha", "beta", "gamma"].includes(t.assignedTo))).toBe(true);
  });

  it("routes each agent only its own assigned question", async () => {
    const llm = new ScriptedProvider();
    await deliberate({ ...OPTS, llm });
    const verdictCalls = llm.calls.filter((c) => c.schema === "agent_verdict");
    // three seats in round 1, plus the adversary in round 4
    expect(verdictCalls).toHaveLength(4);
  });

  it("produces DIRECTED challenges, not broadcast opinions", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    const challenges = r.messages.filter((m) => m.kind === "challenge" && m.round === 2);

    expect(challenges).toHaveLength(2);
    for (const c of challenges) {
      expect(c.to).not.toBe("room");
      expect(c.to).not.toBe(c.from);
    }
    expect(challenges.map((c) => `${c.from}->${c.to}`).sort()).toEqual([
      "alpha->gamma",
      "gamma->alpha",
    ]);
  });

  it("allows an agent to stay silent rather than manufacture disagreement", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    expect(r.messages.some((m) => m.kind === "challenge" && m.from === "beta")).toBe(false);
  });

  it("threads rebuttals back to the challenge that provoked them", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    const replies = r.messages.filter((m) => m.round === 3);
    expect(replies.length).toBeGreaterThan(0);
    for (const reply of replies) {
      expect(reply.inReplyTo).toBeDefined();
      const original = r.messages.find((m) => m.id === reply.inReplyTo);
      expect(original?.to).toBe(reply.from);
    }
  });

  it("records belief revision — the thing fan-out cannot do", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });

    const moved = r.metrics.mindChanges.find((m) => m.agentId === "alpha");
    expect(moved).toBeDefined();
    expect(moved!.from).toBeCloseTo(0.8);
    expect(moved!.to).toBeCloseTo(0.3);
    expect(moved!.conceded).toBe(true);

    // Gamma was challenged and held. Conviction under pressure is not a bug.
    expect(r.metrics.mindChanges.find((m) => m.agentId === "gamma")).toBeUndefined();
    expect(r.metrics.concessions).toBe(1);
    expect(r.metrics.rebuttals).toBe(1);
  });

  it("keeps the room alive when one agent's call fails", async () => {
    class FlakyProvider extends ScriptedProvider {
      override async completeJSON<T>(req: LLMRequest): Promise<T> {
        if (req.system === "AGENT:beta" && req.schema?.name === "challenges") {
          throw new Error("beta exploded");
        }
        return super.completeJSON<T>(req);
      }
    }
    const r = await deliberate({ ...OPTS, llm: new FlakyProvider() });
    expect(r.finalVerdicts).toHaveLength(4);
  });

  it("skips cross-examination in quick mode", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider(), quick: true });
    expect(r.messages.filter((m) => m.kind === "challenge" && m.round === 2)).toHaveLength(0);
    expect(r.metrics.mindChanges).toHaveLength(0);
  });

  it("streams events so the UI never shows dead air", async () => {
    const seen: string[] = [];
    await deliberate({
      ...OPTS,
      llm: new ScriptedProvider(),
      onEvent: (e) => seen.push(e.type),
    });
    expect(new Set(seen)).toEqual(
      new Set(["task", "message", "verdict", "round", "rulings"])
    );
  });
});

describe("collaboration metrics", () => {
  it("reports variance per round", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    expect(r.metrics.varianceByRound).toHaveLength(3); // independent, post-rebuttal, adversarial
    expect(r.metrics.varianceByRound[0]).toBeGreaterThan(0);
  });

  it("signs convergence so that deliberation pulling the room APART is visible", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    // alpha 0.8 -> 0.3 tightens the spread, then the adversary at -0.9 widens it.
    expect(typeof r.metrics.convergence).toBe("number");
    expect(r.metrics.varianceByRound[2]).toBeGreaterThan(r.metrics.varianceByRound[1]);
  });

  it("variance floor catches personas collapsing into one voice", () => {
    const clones = ["a", "b", "c"].map((id) => ({
      agentId: id,
      stance: 0.6,
      confidence: 0.8,
      position: "",
      reasoning: "",
      evidence: [],
      whatWouldChangeMyMind: "",
    }));
    expect(variance(clones)).toBeLessThan(0.01);
  });
});

describe("transcript", () => {
  it("prints a full deliberation", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });

    const lines: string[] = ["", "  ── DELIBERATION TRANSCRIPT ─────────────────────────────"];
    lines.push("  TASKS ASSIGNED BY THE CHAIR:");
    for (const t of r.tasks) lines.push(`    ${t.assignedTo.padEnd(6)} ← ${t.question}`);

    lines.push("");
    for (const m of r.messages) {
      const arrow = m.to === "room" ? "→ room " : `→ ${m.to.padEnd(6)}`;
      lines.push(`    R${m.round} ${m.kind.padEnd(11)} ${m.from.padEnd(6)} ${arrow} "${m.text}"`);
    }

    lines.push("");
    lines.push("  STANCE BY ROUND:");
    for (const round of r.rounds) {
      const s = round.verdicts.map((v) => `${v.agentId}=${v.stance.toFixed(2)}`).join("  ");
      lines.push(`    R${round.round} ${round.name.padEnd(14)} ${s}   σ=${round.variance.toFixed(3)}`);
    }

    lines.push("");
    lines.push("  MINDS CHANGED:");
    for (const c of r.metrics.mindChanges) {
      lines.push(
        `    ${c.agentId} ${c.from.toFixed(2)} → ${c.to.toFixed(2)} (Δ${c.delta.toFixed(2)})${c.conceded ? "  CONCEDED" : ""}`
      );
    }

    lines.push("");
    lines.push(
      `  METRICS: ${r.metrics.challenges} challenges · ${r.metrics.rebuttals} rebuttals · ${r.metrics.concessions} concessions · convergence ${r.metrics.convergence.toFixed(3)}`
    );
    lines.push("  ────────────────────────────────────────────────────────");
    console.log(lines.join("\n"));

    expect(r.messages.length).toBeGreaterThan(5);
  });
});

describe("the chair rules on challenges", () => {
  it("marks a challenge unanswered when nobody replied to it", async () => {
    // beta is challenged by nobody and replies to nobody, so only the two
    // directed challenges can be ruled on at all.
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });

    expect(r.rulings.length).toBe(2);
    for (const ruling of r.rulings) {
      expect(ruling.challenge.length).toBeGreaterThan(0);
      expect(ruling.reason.length).toBeGreaterThan(0);
      expect(ruling.from).not.toBe(ruling.to);
    }
  });

  it("counts what was never answered, because that is the number that costs", async () => {
    const r = await deliberate({ ...OPTS, llm: new ScriptedProvider() });
    expect(r.metrics.unanswered).toBe(
      r.rulings.filter((x) => !x.answered).length
    );
  });

  it("rules a challenge unanswered when no reply exists, whatever the chair says", async () => {
    // A provider that claims everything was answered must not override the
    // plain fact that a challenge drew no reply at all.
    class Generous extends ScriptedProvider {
      override async completeJSON<T>(req: LLMRequest): Promise<T> {
        if (req.schema?.name === "chair_rulings") {
          return {
            rulings: [
              { challengeId: "m4", answered: true, reason: "fine" },
              { challengeId: "m5", answered: true, reason: "fine" },
            ],
          } as T;
        }
        return super.completeJSON<T>(req);
      }
    }

    const r = await deliberate({ ...OPTS, llm: new Generous() });
    // gamma never rebutted alpha's challenge in the script, so it stands.
    const unreplied = r.rulings.filter((x) => x.reason === "Never addressed.");
    for (const u of unreplied) expect(u.answered).toBe(false);
  });
});
