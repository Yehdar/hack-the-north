"use client";

import type { FigureKind } from "@/components/globe/figures";

// ============================================================================
// THE PERSON YOU ARE TALKING TO, ON THE CALL CARD.
//
// The same figure as on the globe — same skin, hair, dress or shirt — drawn
// flat, because the call card can sit right over the spot on the globe where
// that person is standing. Their hello has to be visible somewhere, and here
// it always is.
// ============================================================================

export function FigureAvatar({
  kind,
  skin,
  hair,
  shirt,
  waveKey,
  speaking = false,
  size = 44,
}: {
  kind: FigureKind;
  skin: string;
  hair: string;
  /** Their stance, in the app's red / amber / green. */
  shirt: string;
  /** Change it to wave hello again. */
  waveKey?: string | number;
  speaking?: boolean;
  size?: number;
}) {
  const girl = kind === "girl";

  return (
    <svg
      width={(size * 40) / 56}
      height={size}
      viewBox="0 0 40 56"
      aria-hidden
      className="shrink-0 overflow-visible"
      style={{
        filter: speaking ? "drop-shadow(0 0 6px var(--accent))" : undefined,
        transition: "filter 200ms",
      }}
    >
      {/* long hair falls behind everything else */}
      {girl && <rect x="9" y="11" width="22" height="24" rx="10" fill={hair} />}

      {/* legs */}
      <rect x="14.5" y="41" width="4.6" height="13" rx="2.3" fill="#2a3140" />
      <rect x="20.9" y="41" width="4.6" height="13" rx="2.3" fill="#2a3140" />

      {/* body: a dress that flares, or a shirt */}
      {girl ? (
        <path d="M14 27 L26 27 L32 45 Q20 48 8 45 Z" fill={shirt} />
      ) : (
        <rect x="12" y="27" width="16" height="17" rx="4" fill={shirt} />
      )}

      {/* left arm, hanging */}
      <g transform="rotate(12 11.5 29)">
        <rect x="9.5" y="29" width="4" height="12" rx="2" fill={shirt} />
        <circle cx="11.5" cy="42" r="2.4" fill={skin} />
      </g>

      {/* right arm: waves hello, from the shoulder */}
      <g
        key={waveKey}
        style={{
          transformBox: "view-box",
          transformOrigin: "28.5px 29px",
          transform: "rotate(-12deg)",
          animation: waveKey !== undefined ? "figure-wave 2.2s ease-in-out" : undefined,
        }}
      >
        <rect x="26.5" y="29" width="4" height="12" rx="2" fill={shirt} />
        <circle cx="28.5" cy="42" r="2.4" fill={skin} />
      </g>

      {/* head, hair on top, face — nodding along while they talk */}
      <g className={speaking ? "figure-nod" : undefined}>
      <circle cx="20" cy="18" r="9" fill={skin} />
      <path
        d={
          girl
            ? "M10.6 19 C10 9 15 7.5 20 7.5 C25 7.5 30 9 29.4 19 C27.5 14 24 12.5 20 12.5 C16 12.5 12.5 14 10.6 19 Z"
            : "M11 17 C11 9.5 15.5 8 20 8 C24.5 8 29 9.5 29 17 C27 13.5 24 12.8 20 12.8 C16 12.8 13 13.5 11 17 Z"
        }
        fill={hair}
      />
      {girl && (
        <>
          <rect x="9.4" y="15" width="3.6" height="14" rx="1.8" fill={hair} />
          <rect x="27" y="15" width="3.6" height="14" rx="1.8" fill={hair} />
        </>
      )}
      <g className="figure-blink">
        <circle cx="16.6" cy="19" r="1.35" fill="#1a1620" />
        <circle cx="23.4" cy="19" r="1.35" fill="#1a1620" />
      </g>
      {speaking ? (
        <ellipse className="figure-talk" cx="20" cy="23.4" rx="2.3" ry="1.5" fill="#1a1620" />
      ) : (
        <path d="M17.4 22.6 Q20 24.8 22.6 22.6" stroke="#1a1620" strokeWidth="1" fill="none" strokeLinecap="round" />
      )}
      </g>
    </svg>
  );
}
