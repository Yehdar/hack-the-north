import { NextResponse } from "next/server";
import { isVoiceConfigured, listVoices } from "@/lib/voice/elevenlabs";
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
    return NextResponse.json({ tier: "browser", configured: false, seats });
  }

  try {
    const voices = await listVoices();
    const available = new Set(voices.map((v) => v.voice_id));
    return NextResponse.json({
      tier: "elevenlabs",
      configured: true,
      seats: seats.map((s) => ({
        ...s,
        valid: s.voiceId ? available.has(s.voiceId) : false,
      })),
      accountVoices: voices.slice(0, 40),
    });
  } catch (err) {
    return NextResponse.json({
      tier: "browser",
      configured: true,
      error: err instanceof Error ? err.message : "voices lookup failed",
      seats,
    });
  }
}
