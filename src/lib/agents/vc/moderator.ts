import { getLLM } from "@/lib/llm";
import type { Objection, ObjectionType, SeatId, VentureFile } from "@/lib/types";
import { ventureFileToContext } from "./context";
import { SEATS } from "./seats";

// ============================================================================
// THE MODERATOR — Track B owns this file.
//
// Runs on EVERY founder speech turn, so it is deliberately cheap and fast
// (gpt-5.6-luna). It answers only three questions:
//
//   1. Should a seat interrupt right now?
//   2. If so, which one — whose lane does this fall in?
//   3. Did anything the founder just said resolve an open objection?
//
// It never writes the line the seat speaks. Splitting "should we interrupt"
// from "what do we say" is what keeps the gap between the founder stopping and
// a partner responding short enough to feel like a conversation. A single fat
// call that decided and composed would double the silence.
// ============================================================================

export type ModeratorDecision = {
  shouldRespond: boolean;
  seatId?: SeatId;
  objectionType?: ObjectionType;
  /** What in the segment triggered it. Fed to the seat as its prompt. */
  trigger: string;
  /** Status updates for objections already on the table. */
  resolutions: { objectionId: string; status: "answered" | "dodged" }[];
};

const SCHEMA = {
  type: "object",
  properties: {
    shouldRespond: { type: "boolean" },
    seatId: { type: "string", enum: ["gp", "principal", "skeptic", ""] },
    objectionType: {
      type: "string",
      enum: ["unsupported-claim", "dodged", "competitor", "unit-economics", "timing", ""],
    },
    trigger: { type: "string" },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          objectionId: { type: "string" },
          status: { type: "string", enum: ["answered", "dodged"] },
        },
        required: ["objectionId", "status"],
      },
    },
  },
  required: ["shouldRespond", "trigger", "resolutions"],
} as const;

const SYSTEM = `You moderate a live investment committee meeting. You never speak to the founder and you never compose a partner's words.

You decide only whether a partner should interrupt right now, and which one.

Interrupt when the founder:
  - states a number or a market claim with nothing behind it
  - answers a different question than the one they were asked
  - describes a market without naming who else is in it
  - claims a buyer without establishing who controls that budget
  - has been talking for a long stretch without saying anything falsifiable

Do NOT interrupt merely because the founder is mid-thought, or to be agreeable,
or to ask something already on the table. A meeting where a partner speaks after
every sentence is not a meeting, it is heckling. Silence is usually correct.

Route by lane:
  gp         market size, thesis fit, why now, conviction
  principal  unit economics, competition, go-to-market, retention, numbers
  skeptic    historical analogues, unstated assumptions, the fatal flaw

Separately, mark an open objection "answered" only if the founder gave a
specific, checkable response. Vague acknowledgement is "dodged".`;

export async function moderate(
  segment: string,
  vf: VentureFile,
  openObjections: Objection[]
): Promise<ModeratorDecision> {
  const objectionList =
    openObjections.length > 0
      ? `\n\nOBJECTIONS CURRENTLY ON THE TABLE:\n${openObjections
          .map((o) => `  [${o.id}] (${o.seatId}) ${o.text}`)
          .join("\n")}`
      : "\n\nNo objections on the table yet.";

  const recentTurns = vf.pitchTranscript.slice(-6);
  const recent =
    recentTurns.length > 0
      ? `\n\nTHE LAST FEW TURNS:\n${recentTurns
          .map((t) => `  ${t.speaker === "founder" ? "FOUNDER" : t.speaker.toUpperCase()}: ${t.text}`)
          .join("\n")}`
      : "";

  const raw = await getLLM().completeJSON<Partial<ModeratorDecision>>({
    system: SYSTEM,
    user: `${ventureFileToContext(vf)}${recent}${objectionList}

THE FOUNDER JUST SAID:
"${segment}"

Decide.`,
    schema: { name: "moderator_decision", schema: SCHEMA as unknown as Record<string, unknown> },
    temperature: 0.2,
    maxTokens: 350,
    tier: "fast",
  });

  return normalize(raw, openObjections);
}

function normalize(
  raw: Partial<ModeratorDecision>,
  open: Objection[]
): ModeratorDecision {
  const seatId =
    raw.seatId && raw.seatId in SEATS ? (raw.seatId as SeatId) : undefined;

  const validIds = new Set(open.map((o) => o.id));
  const resolutions = (raw.resolutions ?? []).filter(
    (r) => r && validIds.has(r.objectionId) && (r.status === "answered" || r.status === "dodged")
  );

  return {
    // A decision to interrupt with no seat to carry it is not a decision.
    shouldRespond: Boolean(raw.shouldRespond) && seatId !== undefined,
    seatId,
    objectionType: (raw.objectionType || undefined) as ObjectionType | undefined,
    trigger: raw.trigger?.trim() || "",
    resolutions,
  };
}

/** Applies the moderator's resolutions. Pure — the caller owns persistence. */
export function applyResolutions(
  objections: Objection[],
  decision: ModeratorDecision,
  turn: number
): Objection[] {
  if (decision.resolutions.length === 0) return objections;
  const byId = new Map(decision.resolutions.map((r) => [r.objectionId, r.status]));

  return objections.map((o) => {
    const status = byId.get(o.id);
    return status ? { ...o, status, resolvedAtTurn: turn } : o;
  });
}
