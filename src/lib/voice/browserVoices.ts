// ============================================================================
// THE BEST VOICE THE BROWSER HAS.
//
// With no ElevenLabs or OpenAI key, everyone speaks through speechSynthesis,
// whose default voice is the robotic one. Most machines ship far better voices
//, macOS "Premium"/"Enhanced" voices, Edge's "Natural" ones, Chrome's Google
// voices. They are just never picked. This picks them, and matches each to
// the speaker: the partner drawn as a girl speaks with a woman's voice.
//
// Pure: takes the list, returns a choice. The browser plumbing is in client.ts.
// ============================================================================

export type Gender = "female" | "male";

/** The part of SpeechSynthesisVoice this needs, so it can be tested. */
export type VoiceLike = { name: string; lang: string; localService?: boolean };

// Speech APIs do not report gender, so it is read from well-known voice names.
const FEMALE =
  /\b(samantha|ava|allison|susan|victoria|karen|moira|tessa|fiona|veena|serena|kate|zoe|nicky|joelle|catherine|martha|aria|jenny|michelle|ana|emma|libby|sonia|natasha|clara|zira|hazel|heera|emily|jane|nora|google us english|female)\b/i;
const MALE =
  /\b(alex|daniel|tom|aaron|evan|nathan|oliver|arthur|gordon|lee|rishi|guy|davis|andrew|brian|christopher|eric|roger|steffan|ryan|thomas|william|liam|david|mark|george|james|male)\b/i;

// Novelty and legacy voices: technically English, audibly a machine.
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|flo|fred|good news|grandma|grandpa|hysterical|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/** Higher is more natural. */
export function voiceQuality(v: VoiceLike): number {
  let q = 0;
  if (/natural|neural/i.test(v.name)) q += 60; // Edge / Windows neural voices
  if (/premium/i.test(v.name)) q += 55; // macOS downloadable
  if (/enhanced/i.test(v.name)) q += 45;
  if (/^google/i.test(v.name)) q += 35; // Chrome's network voices
  if (/online/i.test(v.name)) q += 10;
  if (/^en[-_]US/i.test(v.lang)) q += 8;
  else if (/^en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) q += 5;
  if (NOVELTY.test(v.name)) q -= 100;
  return q;
}

export function genderOf(v: VoiceLike): Gender | null {
  // "Google UK English Male" names its gender outright; check that before the
  // first-name lists, which would read "English" as nothing at all.
  if (/\bmale\b/i.test(v.name) && !/\bfemale\b/i.test(v.name)) return "male";
  if (FEMALE.test(v.name)) return "female";
  if (MALE.test(v.name)) return "male";
  return null;
}

/**
 * The best English voice of the wanted gender. `slot` picks the second-best
 * instead of the best, so two partners of the same gender still sound like
 * two different people.
 */
export function pickVoice<V extends VoiceLike>(voices: V[], gender: Gender | null, slot = 0): V | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang) && voiceQuality(v) > -50);
  if (english.length === 0) return null;

  const ranked = [...english].sort((a, b) => voiceQuality(b) - voiceQuality(a));
  const matching = gender ? ranked.filter((v) => genderOf(v) === gender) : ranked;
  const pool = matching.length > 0 ? matching : ranked;
  return pool[Math.min(slot, pool.length - 1)] ?? null;
}

/** Library voice ids already chosen to match each figure, read back as a
 *  gender and a slot for the browser to use. */
const BY_VOICE_ID: Record<string, { gender: Gender; slot: number }> = {
  "21m00Tcm4TlvDq8ikWAM": { gender: "female", slot: 0 },
  "EXAVITQu4vr4xnSDxMaL": { gender: "female", slot: 1 },
  "pNInz6obpgDQGcFmaJgB": { gender: "male", slot: 0 },
  "VR6AewLTigWG4xSOukaG": { gender: "male", slot: 1 },
};

export function castFor(voiceId: string | undefined): { gender: Gender | null; slot: number } {
  return (voiceId && BY_VOICE_ID[voiceId]) || { gender: null, slot: 0 };
}
