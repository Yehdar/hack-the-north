"use client";

// ============================================================================
// THE MARK.
//
// An aperture: six blades around an open centre. It reads as a lens. The
// product is about seeing what is actually there rather than what you assumed —
// and the blades double as the agents arranged around one subject.
//
// Inline SVG rather than a file, so it inherits currentColor, stays crisp at
// any size, and the aperture can open as a loading state instead of needing a
// separate spinner.
// ============================================================================

export function Logo({
  size = 20,
  open = 1,
  className,
}: {
  size?: number;
  /** 0 = closed, 1 = fully open. Animate it to use the mark as a loader. */
  open?: number;
  className?: string;
}) {
  const blades = 6;
  const r = 11;
  // Blades retract toward the rim as the aperture opens.
  const inner = 2.2 + (1 - open) * 5.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="14" cy="14" r={r + 1.5} stroke="currentColor" strokeWidth="1" opacity="0.28" />

      {Array.from({ length: blades }, (_, i) => {
        const a1 = (i / blades) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 1) / blades) * Math.PI * 2 - Math.PI / 2;

        // Each blade is a wedge from the rim inward, leaving the centre open.
        const x1 = 14 + Math.cos(a1) * r;
        const y1 = 14 + Math.sin(a1) * r;
        const x2 = 14 + Math.cos(a2) * r;
        const y2 = 14 + Math.sin(a2) * r;
        const xi = 14 + Math.cos(a1) * inner;
        const yi = 14 + Math.sin(a1) * inner;

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} L ${xi} ${yi} Z`}
            fill="currentColor"
            opacity={0.14 + (i % 2) * 0.1}
          />
        );
      })}

      {/* The pupil. The one thing that is always the accent. */}
      <circle cx="14" cy="14" r={1.9} fill="var(--accent)" />
    </svg>
  );
}

/** Mark plus wordmark. */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 text-ink">
      <Logo size={size} />
      <span
        className="font-mono tracking-[0.02em]"
        style={{ fontSize: size * 0.78 }}
      >
        Vision
      </span>
    </span>
  );
}
