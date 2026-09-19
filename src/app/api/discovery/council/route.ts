import { deliberate } from "@/lib/agents/protocol";
import {
  CONTRARIAN,
  HUB_COUNCIL,
  buildHubSystemPrompt,
  hubContext,
} from "@/lib/agents/hub/roster";
import { computePVS, rankHubs } from "@/lib/pvs";
import { HUB_POINTS } from "@/data/globePoints";
import { getPersona } from "@/data/personas";
import { getLLM } from "@/lib/llm";
import type { WeightMap } from "@/lib/verdict";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdVerdict } from "@/lib/discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================================
// THE HUB COUNCIL — beats ⑥ and ⑦.
//
// Five agents deliberate about one city using the SAME engine the investment
// committee uses: decompose, blind first round, directed cross-examination,
// rebuttal, adversary. Different roster, identical machinery.
// ============================================================================

type CouncilRequest = {
  hubId: string;
  problem: ProblemStatement;
  crowd: CrowdVerdict;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CouncilRequest | null;

  if (!body?.hubId || !body?.problem || !body?.crowd) {
    return new Response(
      JSON.stringify({ error: "hubId, problem and crowd are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const hub = HUB_POINTS.find((h) => h.id === body.hubId);
  const hubName = hub?.label ?? body.hubId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({
          type: "start",
          hubId: body.hubId,
          hubName,
          provider: getLLM().name,
          roster: [...HUB_COUNCIL, CONTRARIAN].map((a) => ({
            id: a.id,
            role: a.role,
            weight: a.defaultWeight,
            focus: a.focus,
          })),
          // Ranked from crowd data alone — cheap enough to do for every hub
          // without convening a council in each.
          hubRanking: rankHubs(body.crowd, body.problem, (id) => getPersona(id)?.hubId),
        });

        const result = await deliberate({
          agents: HUB_COUNCIL,
          adversary: CONTRARIAN,
          context: hubContext(body.hubId, hubName, body.problem, body.crowd),
          buildSystemPrompt: (a) => buildHubSystemPrompt(a, hubName),
          onEvent: send,
        });

        const weights: WeightMap = Object.fromEntries(
          [...HUB_COUNCIL, CONTRARIAN].map((a) => [a.id, a.defaultWeight])
        );

        const pvs = computePVS(body.crowd, result.finalVerdicts, weights);
        send({ type: "pvs", pvs, weights });
        send({ type: "done", result });
      } catch (err) {
        console.error("[council] failed", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "council failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
