import { NextResponse } from "next/server";
import { getLLM } from "@/lib/llm";
import { getActiveFirm } from "@/data/firm";
import { SEATS, CHAIR, DEVILS_ADVOCATE, buildSeatSystemPrompt } from "@/lib/agents/vc/seats";
import { ventureFileToContext } from "@/lib/agents/vc/context";
import type { AgentTemplate, VentureFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// ASKING ONE PARTNER, IN PRIVATE.
//
// The founder pulls a partner aside at the table. They answer in character,
// and crucially they may move: a conversation that cannot change anyone's mind
// is set dressing, and the committee opinion above it would be a decoration.
//
// The move is theirs to make and it is reported honestly. Being asked nicely
// is not an argument, so most exchanges should shift nothing.
// ============================================================================

type AskRequest = {
  seatId: string;
  question: string;
  firmId?: string;
  ventureFile: VentureFile;
  history?: { speaker: "founder" | "agent"; text: string }[];
  stance?: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    line: { type: "string", description: "What you say back. Two or three sentences." },
    stance: { type: "number", description: "-1 to 1, where you stand AFTER this exchange" },
    moved: { type: "boolean", description: "True only if they actually changed your mind" },
    summary: {
      type: "string",
      description: "One short line, third person, on what this conversation changed.",
    },
  },
  required: ["line", "stance", "moved", "summary"],
} as const;

function seatOf(id: string): AgentTemplate | undefined {
  if (id === "chair") return CHAIR;
  if (id === "devils-advocate") return DEVILS_ADVOCATE;
  return SEATS[id as keyof typeof SEATS];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AskRequest | null;
  const question = body?.question?.trim();
  const seat = body?.seatId ? seatOf(body.seatId) : undefined;

  if (!seat || !question || !body?.ventureFile) {
    return NextResponse.json(
      { error: "seatId, question and ventureFile are required" },
      { status: 400 }
    );
  }

  const firm = getActiveFirm(body.firmId);

  const transcript = (body.history ?? [])
    .slice(-8)
    .map((t) => `  ${t.speaker === "founder" ? "FOUNDER" : "YOU"}: ${t.text}`)
    .join("\n");

  try {
    const reply = await getLLM().completeJSON<{
      line: string;
      stance: number;
      moved: boolean;
      summary: string;
    }>({
      system: `${buildSeatSystemPrompt(seat, firm)}

The founder has pulled you aside at the table. This is a private word, not the
formal meeting, so you can be franker than you were in front of the others.

You may change your mind, and you should say so plainly if you do. But be hard
to move: a founder being likeable, confident or persistent is not an argument.
Only evidence, a number you did not have, or a point you genuinely had not
considered should shift you. Most exchanges should leave you where you were.`,
      user: `${ventureFileToContext(body.ventureFile)}

${body.stance !== undefined ? `Where you stand right now: ${body.stance.toFixed(2)} on a scale of -1 to 1.` : ""}

${transcript ? `THE CONVERSATION SO FAR:\n${transcript}\n` : ""}
THE FOUNDER ASKS: "${question}"

Answer as yourself, out loud, in two or three sentences. Then give where you
stand after this exchange, whether they actually moved you, and one short line
in the third person on what this conversation changed.`,
      schema: { name: "partner_reply", schema: SCHEMA as unknown as Record<string, unknown> },
      temperature: seat.temperature,
      maxTokens: 420,
      tier: "deep",
    });

    return NextResponse.json({
      line: reply.line?.trim() || "",
      stance: Math.max(-1, Math.min(1, Number(reply.stance) || (body.stance ?? 0))),
      moved: Boolean(reply.moved),
      summary: reply.summary?.trim() || "",
      role: seat.role,
    });
  } catch (err) {
    console.error("[ask] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ask failed" },
      { status: 500 }
    );
  }
}
