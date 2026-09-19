import { NextResponse } from "next/server";
import { synthesize } from "@/lib/voice/elevenlabs";
import { isOpenAITtsConfigured, synthesizeOpenAI } from "@/lib/voice/openaiTts";
import { SEATS } from "@/lib/agents/vc/seats";
import type { SeatId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Seat line in, mp3 out. ElevenLabs if configured, else OpenAI's voices if
 *  there is an OpenAI key. 503 tells the client to use browser speech instead. */
export async function POST(req: Request) {
  const service = process.env.ELEVENLABS_API_KEY ? "elevenlabs" : isOpenAITtsConfigured() ? "openai" : null;
  if (!service) {
    return NextResponse.json(
      { error: "voice-not-configured", fallback: "browser" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    text?: string;
    seatId?: SeatId;
    /** Any crowd persona can speak, not just the three committee seats. */
    voiceId?: string;
  } | null;

  const text = body?.text?.trim();
  const voiceId = body?.voiceId ?? (body?.seatId ? SEATS[body.seatId]?.persona.voiceId : undefined);

  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  if (!voiceId) {
    return NextResponse.json({ error: "no voice for this speaker" }, { status: 400 });
  }

  try {
    const audio = service === "elevenlabs" ? await synthesize(text, voiceId) : await synthesizeOpenAI(text, voiceId);
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
