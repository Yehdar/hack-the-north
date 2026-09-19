// ============================================================================
// ELEVENLABS, Track B owns this file. SERVER ONLY (reads the API key).
//
// Turn-based by design, per the plan: the founder pushes to talk, we transcribe,
// a seat responds, and ElevenLabs speaks it back before the founder continues.
// No real-time barge-in. That was cut deliberately as too risky for two people.
//
// Everything here degrades. If the key is missing or a call fails, the caller
// falls back to browser speech and then to text, and the meeting still runs.
// ============================================================================

const BASE = "https://api.elevenlabs.io/v1";

/** Low-latency model. A partner that takes three seconds to start talking
 *  reads as broken. Override if the account has something better. */
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_flash_v2_5";
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";

export function isVoiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY not set");
  return k;
}

/** Scribe. Returns the founder's words. */
export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "segment.webm");
  form.append("model_id", STT_MODEL);

  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": key() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return json.text?.trim() ?? "";
}

/**
 * Speech for one seat, in that seat's voice. Returns mp3 bytes.
 *
 * Streamed rather than awaited whole: the audio starts playing while the tail
 * is still generating, which is most of the perceived latency win.
 */
export async function synthesize(text: string, voiceId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${BASE}/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": key(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: {
        // Low stability keeps delivery varied. Three partners who all sound
        // evenly measured undercuts the point of distinct seats.
        stability: 0.4,
        similarity_boost: 0.75,
        style: 0.35,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

/** Voices available on the account. Used to verify the seat voice ids are real
 *  rather than discovering they are not during the demo. */
export async function listVoices(): Promise<{ voice_id: string; name: string }[]> {
  const res = await fetch(`${BASE}/voices`, { headers: { "xi-api-key": key() } });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`);
  const json = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  return json.voices ?? [];
}
