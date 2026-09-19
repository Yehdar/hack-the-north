"use client";

import type { Lean, Minutes as MinutesDoc } from "@/lib/minutes";

// ============================================================================
// THE MINUTES, rendered. The Managing Partner's record of the meeting: shown on
// the committee page once the room decides, on the report after the pitch, and
// kept with the run on the dashboard.
// ============================================================================

const LEAN: Record<Lean, { label: string; color: string }> = {
  for: { label: "leaning yes", color: "var(--go)" },
  undecided: { label: "undecided", color: "var(--caution)" },
  against: { label: "leaning no", color: "var(--stop)" },
};

const DECISION_COLOR = {
  invest: "var(--go)",
  conditional: "var(--caution)",
  pass: "var(--stop)",
} as const;

export function Minutes({ minutes, size = "sm" }: { minutes: MinutesDoc; size?: "sm" | "md" }) {
  const body = size === "md" ? "text-sm" : "text-[12px]";
  const when = new Date(minutes.takenAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`${body} leading-relaxed text-ink/90`}>
      <p className="label">
        Minutes · {minutes.firm} · kept by the {minutes.keptBy.replace(" (chair)", "")} · {when}
      </p>
      {minutes.problem && (
        <p className="mt-2 text-muted">
          The room was asked to back one problem: <span className="text-ink">{minutes.problem}</span>
        </p>
      )}

      <Part title="Decided">
        <p>
          <span
            className="mr-2 font-mono text-[11px] uppercase tracking-[0.14em]"
            style={{ color: DECISION_COLOR[minutes.decision.decision] }}
          >
            {minutes.decision.decision}
          </span>
          {minutes.decision.line}
        </p>
      </Part>

      <Part title="Where each partner stood">
        <ul className="space-y-2">
          {minutes.views.map((v) => (
            <li key={v.role}>
              <p>
                <span className="text-ink">{v.role}</span>
                <span className="ml-2 inline-flex items-center gap-1 text-[11px]" style={{ color: LEAN[v.lean].color }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEAN[v.lean].color }} />
                  {LEAN[v.lean].label}
                </span>
              </p>
              <p className="text-ink/80">&ldquo;{v.view}&rdquo;</p>
              {v.moved && <p className="text-muted">{v.moved}</p>}
            </li>
          ))}
        </ul>
      </Part>

      {minutes.disagreements.length > 0 && (
        <Part title="Where they disagreed">
          <List items={minutes.disagreements} />
        </Part>
      )}

      {minutes.conditions.length > 0 && (
        <Part title="Conditions">
          <List items={minutes.conditions} />
        </Part>
      )}

      {minutes.pitch && (
        <Part title="The pitch">
          <p>
            {minutes.pitch.turns} {minutes.pitch.turns === 1 ? "turn" : "turns"} ·{" "}
            {minutes.pitch.answered} {minutes.pitch.answered === 1 ? "question" : "questions"} answered ·{" "}
            {minutes.pitch.open.length} still open
          </p>
        </Part>
      )}

      <Part title="Next steps">
        <List items={minutes.nextSteps} />
      </Part>

      <Part title="In the room">
        <ul className="space-y-0.5">
          {minutes.present.map((p) => (
            <li key={p.role}>
              <span className="text-ink/85">{p.role}</span> <span className="text-faint">— {p.note}</span>
            </li>
          ))}
        </ul>
      </Part>
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-edge pt-3">
      <p className="label mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className="text-faint">·</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
