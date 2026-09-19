"use client";

import type { SeatId } from "@/lib/types";
import { castFor, pickVoice, voiceQuality, type Gender } from "@/lib/voice/browserVoices";

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

export type Recorder = {
  stop: () => Promise<string>;
  /** Fires as words are recognised, so the founder can see what the room is
   *  about to hear before committing to send it. Only the browser tier can do
   *  this live; ElevenLabs transcribes the whole clip after the fact. */
  onPartial?: (text: string) => void;
};

/** Push-to-talk. Resolves with the founder's words when stop() is called. */
export async function startCapture(
  tier: VoiceTier,
  onPartial?: (text: string) => void
): Promise<Recorder> {
  // Browser recognition streams words as you speak. ElevenLabs cannot — it
  // takes a finished clip — so there we run recognition ALONGSIDE the recorder
  // purely to drive the live caption, and still send the clip to Scribe for the
  // transcript that actually gets used.
  if (tier === "browser") return captureWithRecognition(onPartial);
  return captureWithRecorder(onPartial);
}

async function captureWithRecorder(onPartial?: (t: string) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  rec.start();

  // Caption track: free, best-effort, and discarded if the browser has no
  // recogniser. Scribe still produces the transcript we actually send.
  let caption: SpeechRecognitionLike | null = null;
  if (onPartial) {
    caption = getRecognition();
    if (caption) {
      caption.lang = "en-US";
      caption.interimResults = true;
      caption.continuous = true;
      caption.onresult = (e) => {
        onPartial(
          Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript)
            .join(" ")
            .trim()
        );
      };
      try {
        caption.start();
      } catch {
        caption = null;
      }
    }
  }

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            caption?.stop();
          } catch {
            /* already stopped */
          }
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

function captureWithRecognition(onPartial?: (t: string) => void): Recorder {
  const recognition = getRecognition();
  if (!recognition) throw new Error("no speech recognition available");

  let finalText = "";
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (e) => {
    finalText = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
    onPartial?.(finalText.trim());
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
export type VoiceProfile = {
  voiceId: string;
  pitch: number;
  rate: number;
  /** Which browser voice to use when no service speaks for us. Defaults to
   *  the gender the library voice was chosen for. */
  browser?: { gender: Gender; slot: number };
};

/** Bumped by stopSpeaking(). A line whose synthesis was still in flight when
 *  it changed is dropped instead of starting to play after the stop. */
let epoch = 0;
let playing: { audio: HTMLAudioElement; done: () => void } | null = null;

/**
 * Silence whatever is speaking now, from either tier. Cancelling browser speech
 * alone left an ElevenLabs clip playing to its end — over the next page, if the
 * founder navigated away mid-sentence.
 */
export function stopSpeaking(): void {
  epoch++;
  if (playing) {
    playing.audio.pause();
    playing.done();
  }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

/**
 * Which service can speak for us on the server, if any: ElevenLabs, or OpenAI's
 * voices when there is an OpenAI key but no ElevenLabs one. Asked once.
 */
let serverVoice: Promise<"elevenlabs" | "openai" | null> | null = null;
function serverTts(): Promise<"elevenlabs" | "openai" | null> {
  serverVoice ??= fetch("/api/voice/status")
    .then((r) => r.json())
    .then((j: { tts?: "elevenlabs" | "openai" | null; tier?: string }) =>
      j.tts ?? (j.tier === "elevenlabs" ? "elevenlabs" : null)
    )
    .catch(() => null);
  return serverVoice;
}

/** Speaks a line. Uses ElevenLabs or OpenAI voices when the server has a key,
 *  falls back to the best browser voice otherwise, and resolves either way so
 *  nothing ever stalls waiting on audio. */
export async function speak(
  text: string,
  speaker: SeatId | VoiceProfile,
  tier: VoiceTier
): Promise<void> {
  if (tier === "text" || !text) return;

  const profile = typeof speaker === "string" ? undefined : speaker;
  const mine = epoch;

  if (tier === "elevenlabs" || (await serverTts()) !== null) {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          profile ? { text, voiceId: profile.voiceId } : { text, seatId: speaker }
        ),
      });
      if (res.ok) {
        const blob = await res.blob();
        if (mine !== epoch) return;
        const url = URL.createObjectURL(blob);
        await playUrl(url, longestSay(text, 1));
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // fall through to browser speech
    }
  }
  if (mine !== epoch) return;
  await speakInBrowser(text, speaker);
}

/**
 * The longest a line can reasonably take to say, at a slow 110 words a minute
 * plus a margin. Playback end events are not guaranteed — Chrome's synthesis
 * drops `onend` when no voice is loaded and cuts long utterances off silently —
 * and a screen that waits for the voice before its next line would otherwise
 * wait forever, mid-demo.
 */
function longestSay(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).length;
  return 2500 + (words / (110 * Math.max(0.5, rate))) * 60_000;
}

function playUrl(url: string, limitMs: number): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    const watchdog = setTimeout(() => {
      audio.pause();
      done();
    }, limitMs);
    const done = () => {
      clearTimeout(watchdog);
      if (playing?.audio === audio) playing = null;
      resolve();
    };
    playing = { audio, done };
    audio.onended = done;
    audio.onerror = done;
    void audio.play().catch(done);
  });
}

/** Distinct voice, pitch and rate per seat, matched to how each partner is
 *  drawn: the Principal is a woman, the Lead and Skeptical Partners men. */
const BROWSER_VOICE: Record<SeatId, { pitch: number; rate: number; gender: Gender; slot: number }> = {
  gp: { pitch: 0.85, rate: 0.98, gender: "male", slot: 0 },
  principal: { pitch: 1.15, rate: 1.08, gender: "female", slot: 0 },
  skeptic: { pitch: 0.7, rate: 0.92, gender: "male", slot: 1 },
};

/** The browser's voice list arrives late on first load; wait briefly for it. */
function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

async function speakInBrowser(text: string, speaker: SeatId | VoiceProfile): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const mine = epoch;
  const seat = typeof speaker === "string" ? (BROWSER_VOICE[speaker] ?? undefined) : undefined;
  const cast =
    seat ??
    (typeof speaker === "string" ? castFor(undefined) : (speaker.browser ?? castFor(speaker.voiceId)));
  const voice = pickVoice(await browserVoices(), cast.gender, cast.slot);
  if (mine !== epoch) return;

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const tuning =
      typeof speaker === "string"
        ? (seat ?? { pitch: 1, rate: 1 })
        : { pitch: speaker.pitch, rate: speaker.rate };
    // A natural voice already sounds like a person; bending its pitch the way
    // the default voice needed is what makes it sound synthetic again.
    const natural = voice ? voiceQuality(voice) >= 35 : false;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.pitch = natural ? 1 + (tuning.pitch - 1) * 0.35 : tuning.pitch;
    u.rate = natural ? 1 + (tuning.rate - 1) * 0.5 : tuning.rate;
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, longestSay(text, tuning.rate));
    u.onend = u.onerror = () => {
      clearTimeout(watchdog);
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}
