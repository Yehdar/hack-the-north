"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// THE NARRATOR — one line, top centre, saying what is happening and why.
//
// Anyone who walks up mid-demo should be able to read the screen without the
// presenter. The stage rail says where you are; this says what it means. It is
// also read aloud (lib/voice/narrator.ts); the speaker button mutes it.
// ============================================================================

const noop = () => () => {};

export function Narrator({
  step,
  total,
  title,
  line,
  voice,
}: {
  step?: number;
  total?: number;
  title: string;
  line: string;
  /** The read-aloud toggle. Omit it and no toggle is shown. */
  voice?: { on: boolean; onToggle: () => void };
}) {
  // The remembered mute only exists in the browser; rendering the toggle on
  // the server would disagree with the first client render.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div className="pointer-events-none mx-auto max-w-[440px] text-center" aria-live="polite">
      <p key={title} className="label narrate" style={{ color: "var(--accent)" }}>
        {step && total ? `Step ${step} of ${total} · ` : ""}
        {title}
        {voice && inBrowser && (
          <button
            onClick={voice.onToggle}
            title={voice.on ? "The narrator reads this aloud. Click to mute." : "Read this aloud"}
            aria-label={voice.on ? "Mute the narrator" : "Read the narrator aloud"}
            className="pointer-events-auto ml-2 align-middle text-[12px] normal-case tracking-normal opacity-70 transition hover:opacity-100"
          >
            {voice.on ? "🔊" : "🔇"}
          </button>
        )}
      </p>
      {/* Keyed by stage, not by text: counts inside a line update in place
          instead of replaying the entrance on every batch. */}
      <p key={`${step}:${title}`} className="narrate mt-1.5 text-[13px] leading-snug text-ink/90 [text-shadow:0_1px_12px_var(--ground)]">
        {line}
      </p>
    </div>
  );
}
