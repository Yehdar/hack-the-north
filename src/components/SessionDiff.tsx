import type { SessionDelta } from "@/lib/sessions";

// What moved between a run and the one it came from. Used on the reveal and on
// the dashboard, on dark chrome or on a bone insert.

export function SessionDiff({
  deltas,
  onInsert = false,
}: {
  deltas: SessionDelta[];
  onInsert?: boolean;
}) {
  if (deltas.length === 0) {
    return (
      <p className={`text-[11px] ${onInsert ? "insert-muted" : "text-faint"}`}>
        Nothing a founder would check moved between the two runs.
      </p>
    );
  }

  // Green and crimson are tuned for the dark shell; on bone they need depth.
  const good = onInsert ? "#1d7a46" : "var(--positive)";
  const bad = onInsert ? "#b4232a" : "var(--negative)";
  const tone = (d: SessionDelta) => (d.better === null ? undefined : d.better ? good : bad);

  return (
    <ul className="space-y-2">
      {deltas.map((d) => {
        const prose = d.before.length > 24 || d.after.length > 24;
        return (
          <li key={d.field}>
            {prose ? (
              <>
                <p className="label">{d.field}</p>
                <p className={`mt-0.5 text-[11px] leading-snug line-through opacity-60 ${onInsert ? "" : "text-muted"}`}>
                  {d.before}
                </p>
                <p className="text-[12px] leading-snug" style={{ color: tone(d) }}>
                  {d.after}
                </p>
              </>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <span className="label">{d.field}</span>
                <span className="num text-[12px]">
                  <span className="opacity-50">{d.before}</span>
                  <span className="mx-1.5 opacity-50">→</span>
                  <span style={{ color: tone(d) }}>{d.after}</span>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
