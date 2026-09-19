"use client";

// ============================================================================
// APPROVAL LIGHT.
//
// A bar tells you a quantity. A light tells you a verdict, and a verdict is
// what a founder is actually looking for. Everyone already knows what green,
// amber and red mean, so this needs no legend — which is the whole reason to
// use it instead of another coloured bar.
//
// The word sits next to the dot on purpose: colour alone fails for the ~8% of
// men who cannot separate red from green.
// ============================================================================

export type Signal = "go" | "caution" | "stop" | "off";

const TONE: Record<Signal, { color: string; label: string }> = {
  go: { color: "var(--go)", label: "strong" },
  caution: { color: "var(--caution)", label: "mixed" },
  stop: { color: "var(--stop)", label: "weak" },
  off: { color: "var(--border-bright)", label: "—" },
};

export function Light({
  signal,
  label,
  size = 10,
  pulse = false,
}: {
  signal: Signal;
  /** Overrides the default word. Always show something readable. */
  label?: string;
  size?: number;
  pulse?: boolean;
}) {
  const tone = TONE[signal];
  const text = label ?? tone.label;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{
          width: size,
          height: size,
          background: tone.color,
          // A soft halo so it reads as a lit lamp rather than a flat dot.
          boxShadow:
            signal === "off" ? "none" : `0 0 ${size}px -1px ${tone.color}`,
        }}
      />
      {text && (
        <span className="text-[10px] font-medium tracking-wide" style={{ color: tone.color }}>
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Three lamps in a row, the live one lit and the others dimmed — the way an
 * actual signal head reads. Used where a single status needs to show its
 * position on a scale rather than just its value.
 */
export function LightStack({ signal }: { signal: Signal }) {
  const order: Signal[] = ["stop", "caution", "go"];
  return (
    <span className="inline-flex items-center gap-1">
      {order.map((s) => (
        <span
          key={s}
          className="inline-block h-2 w-2 rounded-full transition-all"
          style={{
            background: TONE[s].color,
            opacity: s === signal ? 1 : 0.16,
            boxShadow: s === signal ? `0 0 8px -1px ${TONE[s].color}` : "none",
          }}
        />
      ))}
    </span>
  );
}

/**
 * Share of a whole, as a light plus its count.
 *
 * Clickable when `onClick` is given: a founder reading "36 walked past it"
 * immediately wants to know who, and making the number the filter is cheaper
 * than a separate control that says the same thing.
 */
export function LightRow({
  signal,
  title,
  count,
  total,
  note,
  onClick,
  selected,
}: {
  signal: Signal;
  title: string;
  count: number;
  total: number;
  note?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const color = TONE[signal].color;

  const body = (
    <>
      <span
        className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full transition-all"
        style={{
          background: color,
          boxShadow: `0 0 9px -1px ${color}`,
          opacity: selected === false ? 0.35 : 1,
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-ink">{title}</span>
          <span className="num shrink-0 text-[12px]" style={{ color }}>
            {count}
            <span className="ml-1 text-[10px] text-muted">of {total}</span>
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-muted">
          {note ?? `${pct}%`}
        </span>
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-start gap-2.5 py-1.5">{body}</div>;
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-full items-start gap-2.5 rounded-[3px] px-1.5 py-1.5 text-left transition hover:bg-surface-2"
      style={{
        background: selected ? "color-mix(in srgb, var(--surface-2) 90%, transparent)" : undefined,
        boxShadow: selected ? `inset 2px 0 0 0 ${color}` : undefined,
      }}
    >
      {body}
    </button>
  );
}
