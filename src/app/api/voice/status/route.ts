import { NextResponse } from "next/server";
import { isVoiceConfigured, listVoices } from "@/lib/voice/elevenlabs";
import { isOpenAITtsConfigured } from "@/lib/voice/openaiTts";
import { SEATS } from "@/lib/agents/vc/seats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which voice tier is live, and — when a key is present — whether the seat
 * voice ids actually exist on this account. Checking that here is the whole
 * point: discovering a bad voice id during the demo is not recoverable.
 */
export async function GET() {
  const seats = Object.values(SEATS).map((s) => ({
    seatId: s.id,
    role: s.role,
    voiceId: s.persona.voiceId,
  }));

  if (!isVoiceConfigured()) {
    // No ElevenLabs: the microphone stays on browser recognition, but playback
    // can still use OpenAI's voices when there is an OpenAI key.
    return NextResponse.json({
      tier: "browser",
      configured: false,
      tts: isOpenAITtsConfigured() ? "openai" : null,
      seats,
    });
  }

  try {
    const voices = await listVoices();
    const available = new Set(voices.map((v) => v.voice_id));
    return NextResponse.json({
      tier: "elevenlabs",
      configured: true,
      tts: "elevenlabs",
      seats: seats.map((s) => ({
        ...s,
        valid: s.voiceId ? available.has(s.voiceId) : false,
      })),
      accountVoices: voices.slice(0, 40),
    });
  } catch (err) {
    // A key can be scoped to text_to_speech without voices_read — that is a
    // perfectly good key for us, since synthesis is all we need. Failing to
    // LIST voices must not disable speaking, which is what it used to do.
    return NextResponse.json({
      tier: "elevenlabs",
      configured: true,
      tts: "elevenlabs",
      unverified: true,
      note:
        "This key cannot list voices, so seat voice ids could not be verified. " +
        "Synthesis is unaffected.",
      error: err instanceof Error ? err.message : "voices lookup failed",
      seats,
    });
  }
}
