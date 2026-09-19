import { getLLM } from "@/lib/llm";
import type { SeatId, VentureFile } from "@/lib/types";
import { ventureFileToContext } from "./context";
import { SEATS, buildSeatSystemPrompt } from "./seats";
import { getActiveFirm } from "@/data/firm";

// ============================================================================
// PRE-READ — Track B owns this file.
//
// Each seat privately reads the venture file before the mic opens and drafts
// its opening position. Two reasons this exists:
//
//  1. Latency. The meeting has to start with a real question, not a spinner.
//  2. Independence. Seats run in parallel and never see each other's draft, so
//     they cannot anchor on one another. Anchoring is how three agents become
//     one agent wearing three hats.
// ============================================================================

export type SeatPreRead = {
  seatId: SeatId;
  /** -1 hostile .. +1 enthusiastic, before hearing a word from the founder. */
  initialLean: number;
  /** Exactly the two things this seat most needs answered. */
  topQuestions: string[];
  /** The single finding that would make this seat vote no regardless. */
  killCriterion: string;
  rationale: string;
};

const PRE_READ_SCHEMA = {
  type: "object",
  properties: {
    initialLean: {
      type: "number",
      description: "-1 (hostile) to 1 (enthusiastic), before hearing the pitch",
    },
    topQuestions: {
      type: "array",
      items: { type: "string" },
      description: "Exactly two questions, in your lane, that you need answered",
    },
    killCriterion: {
      type: "string",
      description: "The one finding that makes you vote no regardless of everything else",
    },
    rationale: { type: "string", description: "One or two sentences, plain speech" },
  },
  required: ["initialLean", "topQuestions", "killCriterion", "rationale"],
  additionalProperties: false,
} as const;

/** One seat's private read. Exported for targeted retries. */
export async function preReadSeat(
  seatId: SeatId,
  vf: VentureFile
): Promise<SeatPreRead> {
  const seat = SEATS[seatId];
  const firm = getActiveFirm();
  const llm = getLLM();

  const raw = await llm.completeJSON<Omit<SeatPreRead, "seatId">>({
    system: buildSeatSystemPrompt(seat, firm),
    user: `${ventureFileToContext(vf)}

You have not met the founder yet. This is your private pre-read.

Draft your opening position: where you lean before hearing a word, the two
questions you most need answered, and the one finding that would sink it for
you regardless of anything else.

Stay strictly in your lane (${seat.focus.join(", ")}). Other seats cover the rest.`,
    schema: { name: "seat_pre_read", schema: PRE_READ_SCHEMA as unknown as Record<string, unknown> },
    temperature: seat.temperature,
    maxTokens: 500,
    tier: "deep",
  });

  return normalize(seatId, raw);
}

/**
 * All seats in parallel. Settled rather than all-or-nothing: one seat failing
 * must not empty the room, so a failed seat degrades to a neutral placeholder
 * and the meeting still runs.
 */
export async function preReadAll(vf: VentureFile): Promise<SeatPreRead[]> {
  const ids = Object.keys(SEATS) as SeatId[];
  const results = await Promise.allSettled(ids.map((id) => preReadSeat(id, vf)));

  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : fallback(ids[i])
  );
}

function normalize(
  seatId: SeatId,
  raw: Partial<Omit<SeatPreRead, "seatId">>
): SeatPreRead {
  const questions = (raw.topQuestions ?? []).filter(
    (q): q is string => typeof q === "string" && q.trim().length > 0
  );

  return {
    seatId,
    initialLean: clamp(Number(raw.initialLean) || 0, -1, 1),
    // The model is asked for two; hold it to two without crashing if it gives
    // one or five.
    topQuestions: questions.slice(0, 2),
    killCriterion: raw.killCriterion?.trim() || "Not stated.",
    rationale: raw.rationale?.trim() || "",
  };
}

function fallback(seatId: SeatId): SeatPreRead {
  return {
    seatId,
    initialLean: 0,
    topQuestions: [],
    killCriterion: "Not stated.",
    rationale: "This seat could not complete its pre-read.",
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
