import { NextResponse } from "next/server";
import { transcribe } from "@/lib/voice/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Founder audio in, text out. The client falls back to browser speech
 *  recognition if this returns 503. */
export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "voice-not-configured", fallback: "browser" },
      { status: 503 }
    );
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "audio required" }, { status: 400 });
    }

    const text = await transcribe(audio);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[stt] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "stt failed", fallback: "browser" },
      { status: 502 }
    );
  }
}
