"use client";

import type { SeatId } from "@/lib/types";

// ============================================================================
// CLIENT VOICE — Track B owns this file.
//
// Three tiers, decided on mount rather than on failure:
//
//   elevenlabs  MediaRecorder -> /api/voice/stt -> seat -> /api/voice/tts
//   browser     SpeechRecognition -> seat -> speechSynthesis
//   text        typed input -> seat -> rendered text
//
// The tier is chosen up front because browser speech recognition consumes the
// live microphone, not a recorded blob — you cannot fall back to it after
// recording has already happened.
// ============================================================================

export type VoiceTier = "elevenlabs" | "browser" | "text";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/**
 * Browsers refuse to play audio that was not initiated by a user gesture, and
 * they fail SILENTLY. Push-to-talk is a gesture, so we unlock on the first
 * press and reuse the context for every seat afterwards. Skipping this is the
 * classic way a voice demo dies on stage while working locally.
 */
let audioCtx: AudioContext | null = null;

export function unlockAudio(): void {
  if (audioCtx) {
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return;
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    // A silent blip is enough to mark the context as user-activated.
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, 22050);
    source.connect(audioCtx.destination);
    source.start(0);
  } catch {
    // Non-fatal: TTS simply will not play, and the transcript still renders.
  }
}

export async function detectTier(): Promise<VoiceTier> {
  try {
    const res = await fetch("/api/voice/status");
    const json = (await res.json()) as { tier?: VoiceTier };
    if (json.tier === "elevenlabs") return "elevenlabs";
  } catch {
    // fall through
  }
  return getRecognition() ? "browser" : "text";
}

// --------------------------------------------------------------------------- capture

export type Recorder = { stop: () => Promise<string> };

/** Push-to-talk. Resolves with the founder's words when stop() is called. */
export async function startCapture(tier: VoiceTier): Promise<Recorder> {
  if (tier === "browser") return captureWithRecognition();
  return captureWithRecorder();
}

async function captureWithRecorder(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  rec.start();

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            const form = new FormData();
            form.append("audio", new Blob(chunks, { type: "audio/webm" }), "segment.webm");
            const res = await fetch("/api/voice/stt", { method: "POST", body: form });
            if (!res.ok) throw new Error(`stt ${res.status}`);
            const json = (await res.json()) as { text?: string };
            resolve(json.text ?? "");
          } catch (err) {
            reject(err);
          }
        };
        rec.stop();
      }),
  };
}

function captureWithRecognition(): Recorder {
  const recognition = getRecognition();
  if (!recognition) throw new Error("no speech recognition available");

  let finalText = "";
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (e) => {
    finalText = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
  };
  recognition.start();

  return {
    stop: () =>
      new Promise<string>((resolve) => {
        recognition.onend = () => resolve(finalText.trim());
        recognition.stop();
        // Safari sometimes never fires onend.
        setTimeout(() => resolve(finalText.trim()), 1200);
      }),
  };
}

// --------------------------------------------------------------------------- playback

/**
 * Voice character for a crowd persona, derived from psychographics rather than
 * demographics. Inferring a voice from someone's name is unreliable and a bad
 * idea; what actually distinguishes two people on a research call is how
 * certain they are and how much they care.
 */
export type VoiceProfile = { voiceId: string; pitch: number; rate: number };

/** Speaks a line. Falls back to browser speech if ElevenLabs is unavailable,
 *  and resolves either way so nothing ever stalls waiting on audio. */
export async function speak(
  text: string,
  speaker: SeatId | VoiceProfile,
  tier: VoiceTier
): Promise<void> {
  if (tier === "text" || !text) return;

  const profile = typeof speaker === "string" ? undefined : speaker;

  if (tier === "elevenlabs") {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          profile ? { text, voiceId: profile.voiceId } : { text, seatId: speaker }
        ),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        await playUrl(url);
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // fall through to browser speech
    }
  }
  await speakInBrowser(text, speaker);
}

function playUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
}

/** Distinct pitch and rate per seat, so the three partners are at least
 *  distinguishable without ElevenLabs. Crude, but better than one voice. */
const BROWSER_VOICE: Record<SeatId, { pitch: number; rate: number }> = {
  gp: { pitch: 0.85, rate: 0.98 },
  principal: { pitch: 1.15, rate: 1.08 },
  skeptic: { pitch: 0.7, rate: 0.92 },
};

function speakInBrowser(text: string, speaker: SeatId | VoiceProfile): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const tuning =
      typeof speaker === "string"
        ? (BROWSER_VOICE[speaker] ?? { pitch: 1, rate: 1 })
        : { pitch: speaker.pitch, rate: speaker.rate };
    u.pitch = tuning.pitch;
    u.rate = tuning.rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
