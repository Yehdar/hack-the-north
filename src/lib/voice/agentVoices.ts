import { stopSpeaking, type VoiceProfile } from "@/lib/voice/client";

// ============================================================================
// VOICES FOR THE DELIBERATING AGENTS.
//
// A council you can only read is a transcript. A council you can hear is a
// meeting. And the moment an agent concedes out loud, in a different voice
// from the one that challenged it, the multi-agent claim stops needing to be
// explained.
//
// Assignment is by ROLE rather than round-robin, so the Contrarian always
// sounds like the Contrarian. Pitch and rate are nudged per role on top of the
// library voice: the sceptics slower and lower, the enthusiasts quicker.
// ============================================================================

/** ElevenLabs public-library voices, verified working against this account. */
const VOICE_POOL = {
  measured: "pNInz6obpgDQGcFmaJgB",
  bright: "21m00Tcm4TlvDq8ikWAM",
  gravelly: "VR6AewLTigWG4xSOukaG",
  warm: "EXAVITQu4vr4xnSDxMaL",
} as const;

const BY_AGENT: Record<string, VoiceProfile> = {
  // Hub council
  market: { voiceId: VOICE_POOL.measured, pitch: 0.95, rate: 1.0 },
  founder: { voiceId: VOICE_POOL.warm, pitch: 1.08, rate: 1.08 },
  customer: { voiceId: VOICE_POOL.bright, pitch: 1.12, rate: 1.02 },
  regulatory: { voiceId: VOICE_POOL.gravelly, pitch: 0.86, rate: 0.93 },
  capital: { voiceId: VOICE_POOL.measured, pitch: 1.0, rate: 0.98 },
  contrarian: { voiceId: VOICE_POOL.gravelly, pitch: 0.8, rate: 0.9 },

  // Investment committee
  gp: { voiceId: VOICE_POOL.measured, pitch: 0.88, rate: 0.97 },
  principal: { voiceId: VOICE_POOL.bright, pitch: 1.14, rate: 1.07 },
  skeptic: { voiceId: VOICE_POOL.gravelly, pitch: 0.82, rate: 0.92 },
  "devils-advocate": { voiceId: VOICE_POOL.warm, pitch: 1.05, rate: 1.05 },
  chair: { voiceId: VOICE_POOL.measured, pitch: 1.0, rate: 1.0 },

  // The narrator: the app itself, telling you what is happening. A voice of
  // its own in the browser, so it is never mistaken for someone in the room.
  narrator: { voiceId: VOICE_POOL.warm, pitch: 1.0, rate: 1.03, browser: { gender: "female", slot: 2 } },
};

export function voiceFor(agentId: string): VoiceProfile {
  return BY_AGENT[agentId] ?? { voiceId: VOICE_POOL.measured, pitch: 1, rate: 1 };
}

/**
 * Speaks agent lines one at a time, in the order they arrived.
 *
 * Deliberation streams faster than speech, so without a queue three agents talk
 * over each other. This also means a listener can follow the argument at the
 * pace of the argument rather than the pace of the network. Which is the
 * reason Phase 2 felt like it happened all at once.
 */
type Line = {
  id: string;
  agentId: string;
  text: string;
  /** Overrides the speaker's usual voice, for a crowd persona on a call. */
  voice?: VoiceProfile;
  /** Resolved when the line has been said, or dropped. */
  done?: () => void;
};

export class SpeechQueue {
  private queue: Line[] = [];
  private running = false;
  private stopped = false;
  private held = false;
  private current: string | null = null;

  constructor(
    private speak: (text: string, voice: VoiceProfile) => Promise<void>,
    private onSpeaking?: (agentId: string | null, id: string | null) => void
  ) {}

  push(id: string, agentId: string, text: string) {
    if (this.stopped || !text.trim()) return;
    this.queue.push({ id, agentId, text });
    void this.drain();
  }

  /**
   * Say this instead of anything this speaker still has queued. And, if they
   * are mid-sentence, cut them off. For the narrator: when the screen moves
   * on, the line about the previous screen is no longer true.
   */
  replace(id: string, agentId: string, text: string) {
    if (this.stopped || !text.trim()) return;
    for (const line of this.queue.filter((q) => q.agentId === agentId)) line.done?.();
    this.queue = this.queue.filter((q) => q.agentId !== agentId);
    if (this.current === agentId) stopSpeaking();
    this.push(id, agentId, text);
  }

  /** Drop what one speaker still has queued, leaving everyone else's lines. */
  drop(agentId: string) {
    for (const line of this.queue.filter((q) => q.agentId === agentId)) line.done?.();
    this.queue = this.queue.filter((q) => q.agentId !== agentId);
    if (this.current === agentId) stopSpeaking();
  }

  /**
   * Say this line and resolve when it has been said. Anything with its own
   * voice, like the person on a call, still goes through this queue: two
   * voices on one page must never start at the same moment.
   */
  say(id: string, agentId: string, text: string, voice?: VoiceProfile): Promise<void> {
    return new Promise((resolve) => {
      if (this.stopped || !text.trim()) return resolve();
      this.queue.push({ id, agentId, text, voice, done: resolve });
      void this.drain();
    });
  }

  /**
   * Give the floor to something else. Used when a call opens: the person on
   * the other end speaks through their own voice, not this queue, and nothing
   * here may talk over them. Anything queued while held waits for release().
   */
  hold() {
    this.held = true;
    this.clear();
  }

  release() {
    this.held = false;
    void this.drain();
  }

  private async drain() {
    if (this.running || this.held) return;
    this.running = true;

    while (this.queue.length > 0 && !this.stopped && !this.held) {
      const next = this.queue.shift()!;
      this.current = next.agentId;
      this.onSpeaking?.(next.agentId, next.id);
      try {
        await this.speak(next.text, next.voice ?? voiceFor(next.agentId));
      } catch {
        // A voice failing must not stall the rest of the room.
      }
      next.done?.();
      this.current = null;
      // A breath between speakers. Without it the room sounds like one person
      // reading a list.
      if (!this.stopped) await new Promise((r) => setTimeout(r, 260));
    }

    this.onSpeaking?.(null, null);
    this.running = false;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Something is being said, or is waiting to be. A screen that paces itself
   *  by the voice waits on this before showing the next line. */
  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  /** Silence the room but keep listening. Used when the founder skips ahead. */
  clear() {
    const dropped = this.queue;
    this.queue = [];
    for (const line of dropped) line.done?.();
    stopSpeaking();
  }

  /** Drop everything still queued. Used when the user leaves or restarts. */
  stop() {
    this.stopped = true;
    this.clear();
  }
}
