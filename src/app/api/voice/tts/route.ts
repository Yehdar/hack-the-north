import { NextResponse } from "next/server";
import { synthesize } from "@/lib/voice/elevenlabs";
import { SEATS } from "@/lib/agents/vc/seats";
import type { SeatId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seat line in, mp3 out. 503 tells the client to use browser speech instead. */
export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "voice-not-configured", fallback: "browser" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    text?: string;
    seatId?: SeatId;
  } | null;

  const text = body?.text?.trim();
  const seat = body?.seatId ? SEATS[body.seatId] : undefined;

  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  if (!seat?.persona.voiceId) {
    return NextResponse.json({ error: "unknown seat" }, { status: 400 });
  }

  try {
    const audio = await synthesize(text, seat.persona.voiceId);
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[tts] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "tts failed", fallback: "browser" },
      { status: 502 }
    );
  }
}
