import { getLLM } from "@/lib/llm";
import type { Persona, CrowdReaction } from "./types";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// TALK TO ONE PERSON.
//
// The crowd gives you a number. This gives you the follow-up question, which is
// where the actual insight lives — a founder learns more from three minutes
// with one sceptic than from a hundred sentiment scores.
//
// The persona is held to what they already said. If they ignored the product in
// the crowd pass, they do not suddenly become enthusiastic because the founder
// is charming; the reaction is their established position and they defend it.
// Without that constraint the call becomes a flattery machine and is worthless.
// ============================================================================

export type PersonaTurn = { speaker: "founder" | "persona"; text: string };

/** Sent in place of a question when the call first connects: they pick up and
 *  say hello, the way anyone answers a call they agreed to take. */
export const CALL_CONNECTED = "(The call just connected.)";

export type PersonaReply = {
  line: string;
  /** Did the founder actually move them? Recorded, not assumed. */
  shifted: boolean;
  /** Their sentiment after this exchange, 0..1. */
  sentiment: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    line: { type: "string", description: "Spoken aloud. One to three sentences, max 55 words." },
    shifted: { type: "boolean", description: "True only if the founder genuinely changed your mind" },
    sentiment: { type: "number", description: "0 hostile to 1 enthusiastic, after this exchange" },
  },
  required: ["line", "shifted", "sentiment"],
} as const;

/**
 * Voice character derived from psychographics rather than demographics.
 *
 * Disposition shapes the delivery: a sceptical laggard is slower and flatter
 * than a high-influence executive. The voice itself follows the figure the
 * persona is drawn as on the globe — an explicit attribute of the persona,
 * never a guess from their name — so the person you clicked sounds like the
 * person you see.
 */
export function voiceProfile(p: Persona): { pitch: number; rate: number; voiceId: string } {
  const g = p.psychographics;
  const assertive = (g.influenceScore + g.budgetAuthority) / 20;
  const eager = g.techAdoption / 10;

  // Two library voices per figure, alternating by id so the same persona
  // always sounds like themselves.
  const VOICES =
    p.figure === "girl"
      ? ["21m00Tcm4TlvDq8ikWAM", "EXAVITQu4vr4xnSDxMaL"]
      : ["pNInz6obpgDQGcFmaJgB", "VR6AewLTigWG4xSOukaG"];

  return {
    pitch: +(0.78 + eager * 0.35 + (1 - g.painTolerance / 10) * 0.12).toFixed(2),
    rate: +(0.88 + assertive * 0.3).toFixed(2),
    voiceId: VOICES[p.id % VOICES.length],
  };
}

export async function askPersona(
  persona: Persona,
  reaction: CrowdReaction | undefined,
  solution: string,
  problems: ProblemStatement[],
  history: PersonaTurn[],
  question: string,
  /** Something they would buy for themselves or their household. */
  consumer = false
): Promise<PersonaReply> {
  const g = persona.psychographics;
  const theirProblem = problems.find((p) => p.id === reaction?.problemId);

  const system = `You are ${persona.name}, a ${persona.title} in ${persona.location.city}. ${persona.professional.seniority} level, ${persona.professional.yearsExperience} years in ${persona.professional.industry}, at a company of ${persona.professional.companySize} people.

How you are wired, scored 1-10. Honour these; they are not decoration:
  new tools        ${g.techAdoption}${g.techAdoption >= 8 ? " — you try things early" : g.techAdoption <= 3 ? " — you wait for proof from someone you trust" : ""}
  risk             ${g.riskTolerance}
  price            ${g.priceSensitivity}${g.priceSensitivity >= 8 ? " — cost is the first thing you think about" : ""}
  budget authority ${g.budgetAuthority}${g.budgetAuthority >= 7 ? " — you can sign for this" : g.budgetAuthority <= 3 ? " — you cannot buy anything; you can only advocate" : ""}
  pain tolerance   ${g.painTolerance}${g.painTolerance >= 8 ? " — you absorb friction and rarely complain" : g.painTolerance <= 3 ? " — you feel every paper cut" : ""}
  brand loyalty    ${g.brandLoyalty}${g.brandLoyalty >= 7 ? " — you trust incumbents" : ""}

A founder is asking you about their product. You are on a call with them.${
  consumer
    ? "\nIt is something people buy for themselves or their household, so answer as a private person — your job is who you are, not why you would buy it."
    : ""
}

${
  reaction
    ? `You have already seen this product and your reaction was: ${reaction.attention} attention, sentiment ${reaction.sentiment.toFixed(2)}, ${reaction.wouldPay ? "you would pay" : "you would NOT pay"}. You said: "${reaction.reason}"
${theirProblem ? `The problem you actually have is: "${theirProblem.statement}"\nWhat you do about it today: "${theirProblem.currentWorkaround}"` : "None of their candidate problems is your problem."}

That is your established position. Hold it. You may be persuaded by a genuinely good argument, but not by enthusiasm, and not by being asked nicely.`
    : "You have not seen this product before."
}

Rules:
- Speak as yourself, out loud, on a call. One to three sentences.
- Be specific to your job. Use the vocabulary someone in your role would use.
- Do not be helpful for its own sake. If the honest answer is "this is not my problem", say that.
- Never break character, never mention being a simulation, never describe your own attributes.`;

  const transcript =
    history.length > 0
      ? `\n\nTHE CALL SO FAR:\n${history
          .map((t) => `  ${t.speaker === "founder" ? "FOUNDER" : "YOU"}: ${t.text}`)
          .join("\n")}`
      : "";

  const greeting = question === CALL_CONNECTED;
  const raw = await getLLM().completeJSON<Partial<PersonaReply>>({
    system,
    user: greeting
      ? `THE PRODUCT: "${solution}"

The call just connected. Pick up the way you would answer a call you agreed to take: say hello and your name, in one or two short natural sentences, in character. Don't give your opinion of the product yet — they haven't asked anything.`
      : `THE PRODUCT: "${solution}"${transcript}

THE FOUNDER ASKS: "${question}"

Answer.`,
    schema: { name: "persona_reply", schema: SCHEMA as unknown as Record<string, unknown> },
    temperature: 0.85,
    maxTokens: 220,
    tier: "deep",
  });

  return {
    line: raw.line?.trim() || "",
    shifted: Boolean(raw.shifted),
    sentiment: Math.min(1, Math.max(0, Number(raw.sentiment) || reaction?.sentiment || 0.5)),
  };
}
