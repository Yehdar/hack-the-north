import OpenAI from "openai";

// ============================================================================
// OPENAI SPEECH — SERVER ONLY (reads the API key).
//
// The voices closest to ChatGPT's own. Used for playback when OPENAI_API_KEY is
// set and ElevenLabs is not; the same key that runs the partners' reasoning
// then also gives them voices that don't sound like a screen reader.
// ============================================================================

const MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

/**
 * Every speaker already has an ElevenLabs voice, chosen to match the figure
 * they are drawn as. Each maps to the OpenAI voice nearest in character, so a
 * partner sounds like the same person whichever service is speaking.
 */
const NEAREST: Record<string, string> = {
  "21m00Tcm4TlvDq8ikWAM": "marin", // bright, female
  "EXAVITQu4vr4xnSDxMaL": "coral", // warm, female
  "pNInz6obpgDQGcFmaJgB": "cedar", // measured, male
  "VR6AewLTigWG4xSOukaG": "ash", // gravelly, male
};

export function isOpenAITtsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function openAIVoice(voiceId?: string): string {
  return (voiceId && NEAREST[voiceId]) || "alloy";
}

export async function synthesizeOpenAI(text: string, voiceId?: string): Promise<ArrayBuffer> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.audio.speech.create({
    model: MODEL,
    voice: openAIVoice(voiceId),
    input: text,
    instructions: "Speak naturally, like a person talking in a meeting: relaxed, warm, conversational pace.",
    response_format: "mp3",
  });
  return res.arrayBuffer();
}
