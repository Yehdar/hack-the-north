import { describe, expect, it } from "vitest";
import { DemoProvider } from "./demo";
import { SEATS, CHAIR, DEVILS_ADVOCATE, buildSeatSystemPrompt } from "@/lib/agents/vc/seats";
import { FIRMS } from "@/data/firms";
import type { AgentTemplate } from "@/lib/types";

// The demo provider works out who is speaking from the words in their system
// prompt. The seats have been renamed twice, and each rename left a partner it
// could not place saying nothing at all in the room. These tests fail on the
// next rename instead.

const firm = FIRMS.bessemer;
const ROOM: AgentTemplate[] = [SEATS.gp, SEATS.principal, SEATS.skeptic, DEVILS_ADVOCATE, CHAIR];

const VERDICT_SCHEMA = { name: "agent_verdict", schema: {} as Record<string, unknown> };
const REPLY_SCHEMA = { name: "partner_reply", schema: {} as Record<string, unknown> };

const file = `THE FOUNDER'S SOLUTION: "A self feeding machine for cats"`;

describe("every seat at the table speaks", () => {
  const demo = new DemoProvider();

  it.each(ROOM.map((seat) => [seat.role, seat] as const))(
    "gives the %s a position of their own",
    async (_role, seat) => {
      const verdict = await demo.completeJSON<{ position?: string; reasoning?: string }>({
        system: buildSeatSystemPrompt(seat, firm),
        user: file,
        schema: VERDICT_SCHEMA,
        tier: "deep",
      });

      // The chair holds no position by design; everyone else must state one.
      if (seat.id === "chair") return;
      expect(verdict.position?.trim(), `${seat.role} said nothing`).toBeTruthy();
    }
  );

  it.each(ROOM.map((seat) => [seat.role, seat] as const))(
    "answers when the %s is pulled aside",
    async (_role, seat) => {
      const reply = await demo.completeJSON<{ line?: string; summary?: string; moved?: boolean }>({
        system: buildSeatSystemPrompt(seat, firm),
        user: `${file}\n\nWhere you stand right now: -0.20 on a scale of -1 to 1.\n\nTHE FOUNDER ASKS: "Who has paid for this so far?"`,
        schema: REPLY_SCHEMA,
        tier: "deep",
      });

      expect(reply.line?.trim(), `${seat.role} replied with nothing`).toBeTruthy();
      expect(reply.summary?.trim()).toBeTruthy();
      // Being asked a question directly is not an argument.
      expect(reply.moved).toBe(false);
    }
  );

  it("answers the question that was actually asked", async () => {
    const onMoney = await demo.completeJSON<{ line: string }>({
      system: buildSeatSystemPrompt(SEATS.principal, firm),
      user: `${file}\n\nTHE FOUNDER ASKS: "What would you need to see on price?"`,
      schema: REPLY_SCHEMA,
      tier: "deep",
    });
    const onSize = await demo.completeJSON<{ line: string }>({
      system: buildSeatSystemPrompt(SEATS.gp, firm),
      user: `${file}\n\nTHE FOUNDER ASKS: "How big do you think this market gets?"`,
      schema: REPLY_SCHEMA,
      tier: "deep",
    });

    expect(onMoney.line).toMatch(/paid|pay|renew|budget/i);
    expect(onSize.line).toMatch(/hundred million|revenue|scale/i);
    expect(onMoney.line).not.toBe(onSize.line);
  });
});
