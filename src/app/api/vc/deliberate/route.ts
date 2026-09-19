import { deliberate } from "@/lib/agents/protocol";
import { ventureFileToContext } from "@/lib/agents/vc/context";
import {
  CHAIR,
  DEVILS_ADVOCATE,
  SEATS,
  buildSeatSystemPrompt,
} from "@/lib/agents/vc/seats";
import { SIMULATION_DISCLAIMER, getActiveFirm } from "@/data/firm";
import { MOCK_VENTURE_FILE } from "@/mocks/ventureFile.mock";
import { buildVerdict, type WeightMap } from "@/lib/verdict";
import { getLLM } from "@/lib/llm";
import type { VentureFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events, one JSON object per line. The committee takes real time
 * to deliberate, so the UI must watch it happen rather than block on a single
 * response — dead air is the enemy.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const quick = url.searchParams.get("quick") === "1";
  return stream(MOCK_VENTURE_FILE, quick);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const vf = (body?.ventureFile as VentureFile | undefined) ?? MOCK_VENTURE_FILE;
  return stream(vf, body?.quick === true, body?.firmId as string | undefined);
}

function stream(vf: VentureFile, quick: boolean, firmId?: string) {
  const firm = getActiveFirm(firmId);
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({
        type: "start",
        firm: { id: firm.id, name: firm.name, decisionStyle: firm.decisionStyle },
        disclaimer: SIMULATION_DISCLAIMER,
        provider: getLLM().name,
        roster: [SEATS.gp, SEATS.principal, SEATS.skeptic, DEVILS_ADVOCATE, CHAIR].map(
          (a) => ({
            id: a.id,
            role: a.role,
            weight: a.defaultWeight,
            focus: a.focus,
            temperature: a.temperature,
          })
        ),
      });

      try {
        const result = await deliberate({
          agents: [SEATS.gp, SEATS.principal, SEATS.skeptic],
          adversary: DEVILS_ADVOCATE,
          context: ventureFileToContext(vf),
          buildSystemPrompt: (a) => buildSeatSystemPrompt(a, firm),
          quick,
          onEvent: send,
        });

        const weights: WeightMap = {
          gp: SEATS.gp.defaultWeight,
          principal: SEATS.principal.defaultWeight,
          skeptic: SEATS.skeptic.defaultWeight,
          "devils-advocate": DEVILS_ADVOCATE.defaultWeight,
        };

        const verdict = buildVerdict(
          result.finalVerdicts,
          weights,
          vf.objections,
          result.finalVerdicts
            .filter((v) => v.stance < 0.2)
            .map((v) => v.whatWouldChangeMyMind)
            .filter(Boolean),
          "You have paying design partners where the budget holder signed."
        );

        send({ type: "done", result, verdict, weights });
      } catch (err) {
        console.error("[deliberate] failed", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "deliberation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
