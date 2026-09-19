"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================================================
// THE NARRATOR, OUT LOUD.
//
// The line at the bottom of the screen says what is happening and what to do
// next. Read aloud, it is the difference between a dashboard and an app that
// walks you through pitching a fund. On by default, but it never speaks before
// the founder has clicked something (browsers block that, and it would be
// hostile anyway), it has a mute that is remembered, and it shares one speech
// queue with the councils so two voices never talk at once.
// ============================================================================

export const useNarratorVoice = create<{ on: boolean; toggle: () => void }>()(
  persist((set, get) => ({ on: true, toggle: () => set({ on: !get().on }) }), {
    name: "vision.narrator",
  })
);

/**
 * What counts as a new line worth saying. Counts that tick up inside the same
 * line ("80 of 120 have answered") are not new lines; a different sentence is.
 */
export function narrationKey(title: string, line: string): string {
  return `${title}|${line}`.replace(/\d+(?:\.\d+)?/g, "#");
}

/** Browsers refuse speech that no click started. Until the founder has
 *  touched the page, the narrator stays quiet rather than failing silently. */
export function mayStartSpeaking(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}
