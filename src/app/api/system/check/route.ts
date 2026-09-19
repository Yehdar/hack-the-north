import { NextResponse } from "next/server";
import { activeModels, getLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One tiny structured call on each tier, against whatever provider is live.
 *
 * Run it the moment a key goes into .env.local. A model that rejects one of
 * the request's parameters fails every call, and every caller absorbs that
 * into a neutral placeholder — so without this, the first sign of a bad key or
 * a wrong model name is a committee with nothing to say, on stage.
 */
export async function GET() {
  const llm = getLLM();
  const live = llm.name.startsWith("openai") || llm.name.startsWith("anthropic");

  if (!live) {
    return NextResponse.json({
      provider: llm.name,
      live: false,
      note: "No live model is configured, so there is nothing to check. Put OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local and restart the dev server.",
    });
  }

  const models = activeModels();
  const tiers = await Promise.all(
    (["deep", "fast"] as const).map(async (tier) => {
      const started = Date.now();
      try {
        const reply = await llm.completeJSON<{ ok?: unknown; word?: unknown }>({
          system: "You are a health check. Reply with exactly the JSON object requested.",
          user: 'Return {"ok": true, "word": "<any one English word>"}.',
          schema: {
            name: "health_check",
            schema: {
              type: "object",
              properties: { ok: { type: "boolean" }, word: { type: "string" } },
              required: ["ok", "word"],
            },
          },
          maxTokens: 60,
          tier,
        });
        return { tier, model: models[tier], ok: reply?.ok === true, ms: Date.now() - started, reply };
      } catch (err) {
        return {
          tier,
          model: models[tier],
          ok: false,
          ms: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  return NextResponse.json(
    { provider: llm.name, live: true, ok: tiers.every((t) => t.ok), tiers },
    { status: tiers.every((t) => t.ok) ? 200 : 502 }
  );
}
