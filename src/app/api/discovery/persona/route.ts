import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { askPersona, CALL_CONNECTED, voiceProfile, type PersonaTurn } from "@/lib/discovery/personaChat";
import type { ProblemStatement } from "@/lib/types";
import type { CrowdReaction } from "@/lib/discovery/types";
import { readPitch } from "@/lib/providers/pitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  personaId: number;
  solution: string;
  question?: string;
  /** The call just connected: say hello instead of answering a question. */
  greet?: boolean;
  problems?: ProblemStatement[];
  reaction?: CrowdReaction;
  history?: PersonaTurn[];
};

/** One turn of a call with a single person from the crowd. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatRequest | null;

  const question = body?.greet ? CALL_CONNECTED : body?.question?.trim();
  if (!body?.personaId || !question) {
    return NextResponse.json(
      { error: "personaId and a question (or greet) are required" },
      { status: 400 }
    );
  }

  const persona = getPersona(body.personaId);
  if (!persona) {
    return NextResponse.json({ error: "unknown persona" }, { status: 404 });
  }

  try {
    const reply = await askPersona(
      persona,
      body.reaction,
      body.solution ?? "",
      body.problems ?? [],
      body.history ?? [],
      question,
      readPitch(body.solution ?? "").consumer
    );

    return NextResponse.json({
      ...reply,
      persona: {
        id: persona.id,
        name: persona.name,
        title: persona.title,
        city: persona.location.city,
      },
      voice: voiceProfile(persona),
    });
  } catch (err) {
    console.error("[persona] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "call failed" },
      { status: 500 }
    );
  }
}
