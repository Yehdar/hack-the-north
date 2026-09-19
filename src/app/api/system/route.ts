import { NextResponse } from "next/server";
import { getLLM } from "@/lib/llm";
import { PERSONAS } from "@/data/personas";
import { HUB_COUNCIL, CONTRARIAN } from "@/lib/agents/hub/roster";
import { SEATS, DEVILS_ADVOCATE, CHAIR } from "@/lib/agents/vc/seats";
import { isVoiceConfigured } from "@/lib/voice/elevenlabs";
import { getActiveFirm } from "@/data/firm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What is actually running. Exists because "how does this work" is the first
 * question anyone asks about a multi-agent system, and pointing at a slide is a
 * worse answer than pointing at the running app.
 */
export async function GET() {
  const llm = getLLM();

  return NextResponse.json({
    provider: llm.name,
    models: {
      deep: process.env.OPENAI_MODEL ?? process.env.ANTHROPIC_MODEL ?? "demo",
      fast: process.env.OPENAI_FAST_MODEL ?? process.env.ANTHROPIC_FAST_MODEL ?? "demo",
    },
    voice: isVoiceConfigured() ? "elevenlabs" : "browser",
    firm: getActiveFirm().name,
    crowd: {
      personas: PERSONAS.length,
      hubs: new Set(PERSONAS.map((p) => p.hubId)).size,
      attributes: 7,
    },
    agents: {
      hubCouncil: HUB_COUNCIL.length + 1,
      investmentCommittee: Object.keys(SEATS).length + 2,
      total: HUB_COUNCIL.length + 1 + Object.keys(SEATS).length + 2,
      roles: [
        ...HUB_COUNCIL.map((a) => a.role),
        CONTRARIAN.role,
        ...Object.values(SEATS).map((a) => a.role),
        DEVILS_ADVOCATE.role,
        CHAIR.role,
      ],
    },
    protocol: {
      rounds: ["decompose", "independent (blind)", "cross-examine", "rebut", "adversarial"],
      shared: true,
    },
    demoMode: process.env.DEMO_MODE === "1",
  });
}
