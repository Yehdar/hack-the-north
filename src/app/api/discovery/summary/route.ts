import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { getLLM } from "@/lib/llm";
import type { PersonaTurn } from "@/lib/discovery/personaChat";
import type { CrowdReaction } from "@/lib/discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// WHAT CAME OUT OF ONE CALL.
//
// A founder who talks to six people cannot hold six conversations in their
// head, and the transcript is too long to re-read. This is the paragraph they
// keep: what the person said, whether they moved, and what it means for the
// pitch. It is written by the model when there is one, and composed from the
// call itself when there is not, so the button works with no key.
// ============================================================================

type SummaryRequest = {
  personaId: number;
  solution?: string;
  turns: PersonaTurn[];
  reaction?: CrowdReaction;
};

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "Two or three sentences a founder would keep in their notes: what this person said, whether they moved, and what it means for the pitch. Plain words, no headings.",
    },
    takeaway: {
      type: "string",
      description: "The single most useful thing to do about it, one short sentence.",
    },
  },
  required: ["summary", "takeaway"],
} as const;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as SummaryRequest | null;
  const turns = body?.turns ?? [];

  if (!body?.personaId || turns.length === 0) {
    return NextResponse.json({ error: "personaId and turns are required" }, { status: 400 });
  }

  const persona = getPersona(body.personaId);
  if (!persona) return NextResponse.json({ error: "unknown persona" }, { status: 404 });

  const llm = getLLM();
  const transcript = turns
    .map((t) => `${t.speaker === "founder" ? "FOUNDER" : persona.name.toUpperCase()}: ${t.text}`)
    .join("\n");

  // The demo provider has no way to read a conversation, so asking it for a
  // summary would produce something that sounds like one and is not.
  if (llm.name === "demo" || llm.name === "mock") {
    return NextResponse.json(composed(persona.name, turns, body.reaction));
  }

  try {
    const written = await llm.completeJSON<{ summary?: string; takeaway?: string }>({
      system: `You write a founder's notes after a customer research call. You are not a cheerleader: if the person was unmoved, say so. Never invent anything that was not said.`,
      user: `THE PRODUCT: "${body.solution ?? ""}"

THE PERSON: ${persona.name}, ${persona.title} in ${persona.location.city}.${
        body.reaction
          ? ` Before the call they said: "${body.reaction.reason}" (${body.reaction.wouldPay ? "would pay" : "would not pay"}).`
          : ""
      }

THE CALL:
${transcript}

Summarise it.`,
      schema: { name: "call_summary", schema: SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.4,
      maxTokens: 260,
      tier: "fast",
    });

    return NextResponse.json({
      summary: written.summary?.trim() || composed(persona.name, turns, body.reaction).summary,
      takeaway: written.takeaway?.trim() ?? "",
    });
  } catch (err) {
    console.error("[summary] failed", err);
    return NextResponse.json(composed(persona.name, turns, body.reaction));
  }
}

/**
 * The call, summarised from what is on the record: how many questions were
 * asked, the sharpest thing they said, and where they ended up. No model, and
 * nothing claimed that was not said.
 */
function composed(name: string, turns: PersonaTurn[], reaction?: CrowdReaction) {
  const asked = turns.filter((t) => t.speaker === "founder").length;
  // Everything they said after the first question. Their hello is not a
  // finding, and it is often the longest thing on the transcript.
  const opened = turns.findIndex((t) => t.speaker === "founder");
  const theirs = (opened === -1 ? [] : turns.slice(opened)).filter((t) => t.speaker === "persona");
  const longest = [...theirs].sort((a, b) => b.text.length - a.text.length)[0]?.text ?? "";
  const last = theirs[theirs.length - 1]?.text ?? "";
  const first = name.split(" ")[0];

  const stance = reaction
    ? reaction.wouldPay
      ? "They would pay to fix the problem they have."
      : reaction.problemId
        ? "They have the problem but would not pay to fix it."
        : "None of the problems on the table are theirs."
    : "";

  return {
    summary: `${asked} ${asked === 1 ? "question" : "questions"} to ${first}. ${stance} The line worth keeping: "${trim(longest)}"`.trim(),
    // Only when it adds something: after one question the last thing they
    // said is the line already quoted above.
    takeaway: last && last !== longest ? `They left it here: "${trim(last)}"` : "",
  };
}

function trim(text: string): string {
  const t = text.trim();
  return t.length > 180 ? `${t.slice(0, 177).trimEnd()}…` : t;
}
