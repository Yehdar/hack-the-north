import { NextResponse } from "next/server";
import { applyResolutions, moderate } from "@/lib/agents/vc/moderator";
import { speakAs, toObjection } from "@/lib/agents/vc/speak";
import { MOCK_VENTURE_FILE } from "@/mocks/ventureFile.mock";
import type { Objection, TranscriptTurn, VentureFile } from "@/lib/types";
import type { SeatPreRead } from "@/lib/agents/vc/preread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// ONE TURN OF THE MEETING.
//
//   founder speaks -> moderator decides -> a seat answers (or nobody does)
//
// The client owns the venture file and posts it back each turn, so the meeting
// is stateless on the server. That is deliberate for a hackathon: no session
// store to break, and DEMO_MODE can replay a meeting by replaying its turns.
// ============================================================================

type TurnRequest = {
  segment: string;
  ventureFile?: VentureFile;
  preReads?: SeatPreRead[];
  firmId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as TurnRequest | null;
  const segment = body?.segment?.trim();

  if (!segment) {
    return NextResponse.json({ error: "segment required" }, { status: 400 });
  }

  const vf: VentureFile = body?.ventureFile ?? MOCK_VENTURE_FILE;
  const turn = vf.pitchTranscript.length + 1;

  // The founder's turn lands whether or not anyone responds to it.
  const founderTurn: TranscriptTurn = {
    turn,
    speaker: "founder",
    text: segment,
    at: Date.now(),
  };
  const transcript = [...vf.pitchTranscript, founderTurn];
  const working: VentureFile = { ...vf, pitchTranscript: transcript };

  try {
    const open = vf.objections.filter((o) => o.status === "open");
    const decision = await moderate(segment, working, open);

    // Resolutions apply regardless of whether a seat speaks — answering a
    // question should clear it even when nobody interrupts.
    let objections: Objection[] = applyResolutions(vf.objections, decision, turn);

    if (!decision.shouldRespond || !decision.seatId) {
      return NextResponse.json({
        spoke: false,
        trigger: decision.trigger,
        ventureFile: { ...working, objections },
      });
    }

    const preRead = body?.preReads?.find((p) => p.seatId === decision.seatId);
    const response = await speakAs(decision.seatId, decision.trigger, working, preRead, body?.firmId);

    const seatTurn: TranscriptTurn = {
      turn: turn + 1,
      speaker: decision.seatId,
      text: response.line,
      at: Date.now(),
    };

    if (response.isObjection) {
      objections = [
        ...objections,
        toObjection(decision.seatId, response, decision.objectionType, turn + 1),
      ];
    }

    return NextResponse.json({
      spoke: true,
      seatId: decision.seatId,
      line: response.line,
      isObjection: response.isObjection,
      trigger: decision.trigger,
      ventureFile: {
        ...working,
        pitchTranscript: [...transcript, seatTurn],
        objections,
      },
    });
  } catch (err) {
    console.error("[turn] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "turn failed" },
      { status: 500 }
    );
  }
}
