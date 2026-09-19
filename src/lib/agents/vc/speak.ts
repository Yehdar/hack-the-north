import { getLLM } from "@/lib/llm";
import { getActiveFirm } from "@/data/firm";
import type { Objection, ObjectionType, SeatId, VentureFile } from "@/lib/types";
import { ventureFileToContext } from "./context";
import { SEATS, buildSeatSystemPrompt } from "./seats";
import type { SeatPreRead } from "./preread";

// ============================================================================
// SEAT RESPONSE — what a partner actually says out loud. Track B owns this.
//
// The Moderator already decided that this seat should speak and why. This call
// only composes the line. It is constrained hard on length because the output
// is going to a text-to-speech engine and then into a room: a partner who
// monologues for forty seconds kills the conversation, and the founder cannot
// interrupt in a turn-based design.
// ============================================================================

export type SeatResponse = {
  /** Spoken aloud. One or two sentences. */
  line: string;
  /** Whether this puts a new challenge on the table. */
  isObjection: boolean;
  /** Canonical phrasing for the tracker — terser than the spoken line. */
  objectionText: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    line: { type: "string", description: "Spoken aloud. One or two sentences, max 45 words." },
    isObjection: { type: "boolean" },
    objectionText: { type: "string", description: "The challenge in one terse clause, for the tracker" },
  },
  required: ["line", "isObjection", "objectionText"],
} as const;

export async function speakAs(
  seatId: SeatId,
  trigger: string,
  vf: VentureFile,
  preRead?: SeatPreRead
): Promise<SeatResponse> {
  const seat = SEATS[seatId];
  const firm = getActiveFirm();

  const prep = preRead
    ? `\n\nBefore this meeting you wrote privately:
  Your lean: ${preRead.initialLean.toFixed(2)}
  What you needed answered: ${preRead.topQuestions.join(" / ")}
  What would sink it for you: ${preRead.killCriterion}`
    : "";

  const recent = vf.pitchTranscript.slice(-6);
  const transcript =
    recent.length > 0
      ? `\n\nTHE LAST FEW TURNS:\n${recent
          .map((t) => `  ${t.speaker === "founder" ? "FOUNDER" : t.speaker.toUpperCase()}: ${t.text}`)
          .join("\n")}`
      : "";

  const raw = await getLLM().completeJSON<Partial<SeatResponse>>({
    system: buildSeatSystemPrompt(seat, firm),
    user: `${ventureFileToContext(vf)}${prep}${transcript}

The chair has given you the floor because: ${trigger}

Say your piece. You are speaking out loud in a room, not writing a memo.

  - One or two sentences. Forty-five words is the ceiling.
  - Press on the specific thing, not the general topic.
  - Do not restate what the founder just said back to them.
  - Do not soften it into a compliment sandwich. This is diligence.
  - If you are putting a new challenge on the table, set isObjection.`,
    schema: { name: "seat_response", schema: SCHEMA as unknown as Record<string, unknown> },
    temperature: seat.temperature,
    maxTokens: 250,
    tier: "deep",
  });

  const line = raw.line?.trim() || "";
  return {
    line,
    isObjection: Boolean(raw.isObjection),
    objectionText: raw.objectionText?.trim() || line,
  };
}

/** Mints a tracker entry from a seat response. Pure. */
export function toObjection(
  seatId: SeatId,
  response: SeatResponse,
  type: ObjectionType | undefined,
  turn: number
): Objection {
  return {
    id: `obj_${turn}_${seatId}`,
    seatId,
    text: response.objectionText,
    type: type ?? "unsupported-claim",
    status: "open",
    raisedAtTurn: turn,
  };
}
