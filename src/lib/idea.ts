// ============================================================================
// IS THIS AN IDEA?
//
// A founder can type "asdf" and the whole machine runs: 120 people react to
// nonsense, a council argues about it, a committee votes on it. Everything
// downstream is only as honest as this sentence, so junk is turned away here.
//
// Deliberately loose. "Uber for dogs" is a lazy pitch and still a pitch; it is
// not this file's job to decide whether an idea is any good, only whether
// there is one. It rejects three things: too little to work with, keyboard
// mash, and text with no real words in it.
// ============================================================================

export type IdeaCheck = { ok: true } | { ok: false; message: string };

const MIN_WORDS = 3;
const MIN_CHARS = 12;

/** Runs of keys that sit next to each other. Typed by a hand, not a person. */
const MASH = /(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm|1234|2345|3456|abcdef)/i;

const STOP = new Set(
  "the a an and or for with from into that this it is are was were be been being of to in on at by we i you my our your their them they he she as have has had do does did not no yes so but if then than there here what which who whom whose when where why how".split(
    " "
  )
);

/** A token that reads like a word: it has a vowel, or it is a short acronym
 *  like CRM, ERP or SMB, which pitches are full of. */
function looksLikeAWord(word: string): boolean {
  if (/^[A-Z0-9]{2,5}$/.test(word)) return true;
  const w = word.toLowerCase();
  if (!/[aeiouy]/.test(w)) return false;
  if (MASH.test(w)) return false;
  // "aaaaah", "hmmmm": the same letter three times or more.
  if (/(.)\1{2,}/.test(w)) return false;
  // Five letters with one vowel or fewer is not English.
  const vowels = (w.match(/[aeiouy]/g) ?? []).length;
  if (w.length >= 5 && vowels / w.length < 0.2) return false;
  // Four consonants in a row, outside the handful of clusters English allows.
  if (/[bcdfghjklmnpqrstvwxz]{4,}/.test(w) && !/(ght|tch|nch|rch|thr|str|scr|spr|spl|shr)/.test(w)) {
    return false;
  }
  return true;
}

const TOO_SHORT =
  "Say a bit more. One sentence is enough: what it is, and who it is for.";
const NOT_AN_IDEA =
  "That does not look like an idea yet. Try a sentence like “An app that helps students revise for exams”.";

/**
 * Whether there is an idea here at all. The message is written to be read by
 * the person who typed it, so it says what to do rather than what went wrong.
 */
export function checkIdea(raw: string): IdeaCheck {
  const text = raw.trim().replace(/\s+/g, " ");
  const words = text.split(" ").filter(Boolean);

  if (text.length < MIN_CHARS || words.length < MIN_WORDS) {
    return { ok: false, message: TOO_SHORT };
  }

  const real = words.filter((w) => looksLikeAWord(w.replace(/[^\p{L}\p{N}]/gu, "")));
  if (real.length / words.length < 0.6) return { ok: false, message: NOT_AN_IDEA };

  // At least two words carrying meaning. "It is for the one that we have" is
  // grammatical, and says nothing a market could be asked about.
  const meaning = real.filter((w) => !STOP.has(w.toLowerCase().replace(/[^\p{L}]/gu, "")));
  if (meaning.length < 2) return { ok: false, message: NOT_AN_IDEA };

  return { ok: true };
}
