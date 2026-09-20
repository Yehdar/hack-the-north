"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// THE NARRATOR. One line, top centre, saying what is happening and why.
//
// Anyone who walks up mid-demo should be able to read the screen without the
// presenter. The stage rail says where you are; this says what it means. It is
// also read aloud (lib/voice/narrator.ts); the speaker button mutes it.
// ============================================================================

const noop = () => () => {};

export function Narrator({
  step,
  title,
  line,
  voice,
}: {
  /** Kept only to key the entrance animation per stage. */
  step?: number;
  title: string;
  line: string;
  /** The read-aloud toggle. Omit it and no toggle is shown. */
  voice?: { on: boolean; onToggle: () => void };
}) {
  // The remembered mute only exists in the browser; rendering the toggle on
  // the server would disagree with the first client render.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="pointer-events-none mx-auto flex max-w-[440px] justify-center" aria-live="polite">
      {/* This sits directly over the globe or the boardroom floor, both of
          which are busy underneath it. It used to rely on a text shadow for
          contrast, which worked on the old near-black scenes and stopped
          working the moment either one turned light. A real panel holds up
          regardless of what is under it. */}
      <div className="panel panel-bright pointer-events-auto px-4 py-3 text-center">
        {/* No "Step 3 of 8 · Deploy" any more. The numbered rail on the left
            already says which step this is, and saying it twice on one screen
            made the middle of the page compete with the navigation. */}
        <p key={title} className="label narrate" style={{ color: "var(--accent)" }}>
          {title}
          {voice && inBrowser && (
            <button
              onClick={voice.onToggle}
              title={voice.on ? "The narrator reads this aloud. Click to mute." : "Read this aloud"}
              aria-label={voice.on ? "Mute the narrator" : "Read the narrator aloud"}
              className="ml-2 align-middle text-[14px] normal-case tracking-normal opacity-70 transition hover:opacity-100"
            >
              {voice.on ? "🔊" : "🔇"}
            </button>
          )}
        </p>
        {/* Keyed by stage, not by text: counts inside a line update in place
            instead of replaying the entrance on every batch. */}
        <p key={`${step}:${title}`} className="narrate mt-1.5 text-[15px] leading-snug text-ink/90">
          {line}
        </p>
      </div>
    </div>
  );
}
