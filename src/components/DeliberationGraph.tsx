"use client";

// ============================================================================
// THE DELIBERATION, DRAWN.
//
// The protocol's messages are typed and addressed, so the meeting is a graph:
// who challenged whom, who answered, who conceded. Drawing it is the fastest
// way to show that the agents read each other rather than voting in parallel —
// and both councils draw through this one component, because they run through
// one engine.
// ============================================================================

type Seat = { id: string; role: string; weight: number };
type Stance = { stance: number; confidence?: number };
type Message = { id: string; from: string; to: string; kind: string; text: string };

const SHORT: Record<string, string> = {
  gp: "GP",
  principal: "Principal",
  skeptic: "Skeptic",
  "devils-advocate": "Devil's adv.",
  market: "Market",
  founder: "Founder",
  customer: "Customer",
  regulatory: "Reg & ops",
  capital: "Capital",
  contrarian: "Contrarian",
};

const EDGE: Record<string, string> = {
  challenge: "var(--accent)",
  rebuttal: "var(--muted)",
  concession: "var(--positive)",
};

/** Stance as a fill: crimson for no, green for yes, neutral grey between. */
function stanceFill(s?: number): string {
  if (s === undefined) return "var(--surface-2)";
  const pct = Math.round(Math.min(1, Math.abs(s)) * 100);
  const end = s >= 0 ? "var(--positive)" : "var(--negative)";
  return `color-mix(in srgb, ${end} ${pct}%, var(--border-bright))`;
}

export function DeliberationGraph({
  seats,
  stances,
  messages,
  active,
  conceded,
  height = 210,
}: {
  seats: Seat[];
  stances: Record<string, Stance | undefined>;
  messages: Message[];
  active?: Set<string>;
  conceded?: Set<string>;
  height?: number;
}) {
  const voting = seats.filter((s) => s.weight > 0);
  const W = 300;
  const H = height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 36;

  const pos = new Map(
    voting.map((s, i) => {
      const a = -Math.PI / 2 + (i / voting.length) * Math.PI * 2;
      return [s.id, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a }];
    })
  );

  const directed = messages.filter((m) => m.to !== "room" && pos.has(m.from) && pos.has(m.to));
  const latest = messages[messages.length - 1];
  const latestEdge = [...directed].reverse()[0];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Who challenged whom in this deliberation"
      >
        <defs>
          {Object.entries(EDGE).map(([kind, color]) => (
            <marker
              key={kind}
              id={`tip-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={color} />
            </marker>
          ))}
        </defs>

        {/* The table. */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeDasharray="2 4" />

        {/* The chair: routes the questions, never votes. */}
        <circle cx={cx} cy={cy} r={4} fill="var(--faint)" />
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-[var(--faint)] font-mono text-[8px] uppercase tracking-[0.14em]">
          chair
        </text>

        {directed.map((m) => {
          const a = pos.get(m.from)!;
          const b = pos.get(m.to)!;
          // Bow each edge toward the middle of the table, and offset by
          // direction so A→B and B→A never draw on top of each other.
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const nx = -(b.y - a.y);
          const ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1;
          const bow = 0.18 * len;
          const qx = mx + (cx - mx) * 0.45 + (nx / len) * bow * 0.35;
          const qy = my + (cy - my) * 0.45 + (ny / len) * bow * 0.35;
          const trim = (p: { x: number; y: number }, toward: { x: number; y: number }, by: number) => {
            const dx = toward.x - p.x;
            const dy = toward.y - p.y;
            const d = Math.hypot(dx, dy) || 1;
            return { x: p.x + (dx / d) * by, y: p.y + (dy / d) * by };
          };
          const start = trim(a, { x: qx, y: qy }, 14);
          const end = trim(b, { x: qx, y: qy }, 16);
          const isLatest = m.id === latestEdge?.id;
          const color = EDGE[m.kind] ?? "var(--muted)";

          return (
            <path
              key={m.id}
              d={`M${start.x},${start.y} Q${qx},${qy} ${end.x},${end.y}`}
              fill="none"
              stroke={color}
              strokeWidth={isLatest ? 1.8 : 1.1}
              strokeOpacity={isLatest ? 1 : 0.4}
              markerEnd={`url(#tip-${m.kind in EDGE ? m.kind : "rebuttal"})`}
              className={isLatest ? "flow" : undefined}
            >
              <title>{`${SHORT[m.from] ?? m.from} → ${SHORT[m.to] ?? m.to}: ${m.text}`}</title>
            </path>
          );
        })}

        {voting.map((s) => {
          const p = pos.get(s.id)!;
          const v = stances[s.id];
          const r = 8 + s.weight * 24;
          const speaking = latest?.from === s.id;
          const labelBelow = p.y >= cy - 1;

          return (
            <g key={s.id}>
              {/* The adversary, or anyone addressing the whole room, pulses. */}
              {speaking && latest?.to === "room" && (
                <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={EDGE[latest.kind] ?? "var(--muted)"} strokeWidth={1.2}>
                  <animate attributeName="r" from={r} to={r + 16} dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" from="0.9" to="0" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              {active?.has(s.id) && (
                <circle cx={p.x} cy={p.y} r={r + 4} fill="none" stroke="var(--accent)" strokeOpacity={0.6}>
                  <animate attributeName="stroke-opacity" values="0.7;0.1;0.7" dur="1.1s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={stanceFill(v?.stance)}
                stroke={conceded?.has(s.id) ? "var(--positive)" : "var(--border-bright)"}
                strokeWidth={conceded?.has(s.id) ? 2 : 1}
              >
                <title>{`${s.role} · ${Math.round(s.weight * 100)}% of the vote${v ? ` · stance ${v.stance.toFixed(2)}` : ""}`}</title>
              </circle>
              <text
                x={p.x}
                y={labelBelow ? p.y + r + 12 : p.y - r - 6}
                textAnchor="middle"
                className="fill-[var(--text)] font-mono text-[9px] uppercase tracking-[0.12em]"
              >
                {SHORT[s.id] ?? s.role}
              </text>
              {v && (
                <text
                  x={p.x}
                  y={p.y + 3}
                  textAnchor="middle"
                  className="fill-[var(--ground)] font-mono text-[8px] font-semibold"
                >
                  {v.stance > 0 ? "+" : ""}
                  {v.stance.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 min-h-[34px]">
        {latest ? (
          <p key={latest.id} className="narrate text-[11px] leading-snug text-ink/80">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: EDGE[latest.kind] ?? "var(--muted)" }}>
              {SHORT[latest.from] ?? latest.from} → {latest.to === "room" ? "the room" : SHORT[latest.to] ?? latest.to} · {latest.kind}
            </span>{" "}
            {latest.text}
          </p>
        ) : (
          <p className="text-[11px] text-faint">Nobody has spoken yet.</p>
        )}
      </div>

      <div className="mt-2 flex gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
        <span style={{ color: "var(--accent)" }}>— challenge</span>
        <span>— rebuttal</span>
        <span style={{ color: "var(--positive)" }}>— concession</span>
      </div>
    </div>
  );
}
