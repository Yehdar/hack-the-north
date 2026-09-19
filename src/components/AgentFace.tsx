"use client";

import { motion } from "framer-motion";

// ============================================================================
// AGENT FACES.
//
// The council graph was labelled circles with a number in them. Circles do not
// look like they are arguing — you have to read the graph to know anything is
// happening. A face does the work for free: it is the one shape people parse
// without trying.
//
// Everything animated here is bound to state that already exists, so nothing is
// decorative. The mouth moves only while that agent is genuinely speaking, the
// brows follow its stance, and the eyes look toward whoever it just challenged.
// ============================================================================

export type FaceMood = "positive" | "neutral" | "negative";

export function moodOf(stance?: number): FaceMood {
  if (stance === undefined) return "neutral";
  if (stance > 0.2) return "positive";
  if (stance < -0.2) return "negative";
  return "neutral";
}

const SKIN: Record<FaceMood, { fill: string; ring: string }> = {
  positive: { fill: "rgba(63,185,80,0.16)", ring: "var(--go)" },
  neutral: { fill: "rgba(148,161,184,0.14)", ring: "var(--border-bright)" },
  negative: { fill: "rgba(229,83,75,0.16)", ring: "var(--stop)" },
};

export function AgentFace({
  mood,
  speaking = false,
  thinking = false,
  conceded = false,
  /** -1 = look hard left, 0 = ahead, 1 = hard right. Points at whoever it is
   *  addressing, which is what makes a graph of faces read as a conversation. */
  gaze = 0,
  size = 56,
  dimmed = false,
}: {
  mood: FaceMood;
  speaking?: boolean;
  thinking?: boolean;
  conceded?: boolean;
  gaze?: number;
  size?: number;
  dimmed?: boolean;
}) {
  const skin = SKIN[mood];
  const look = Math.max(-1, Math.min(1, gaze)) * 2.2;

  // Brows carry the stance: down and angled in for a sceptic, lifted for
  // someone who likes what they are hearing.
  const browY = mood === "negative" ? 15.5 : mood === "positive" ? 12.5 : 14;
  const browTilt = mood === "negative" ? 7 : mood === "positive" ? -3 : 0;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      animate={{ opacity: dimmed ? 0.4 : 1, scale: speaking ? 1.06 : 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      aria-hidden
    >
      {/* halo while speaking, so you can find the talker without reading */}
      {speaking && (
        <motion.circle
          cx="24" cy="24" r="22"
          fill="none"
          stroke={skin.ring}
          strokeWidth="1"
          initial={{ opacity: 0.8, r: 20 }}
          animate={{ opacity: 0, r: 26 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <circle cx="24" cy="24" r="19" fill={skin.fill} stroke={skin.ring} strokeWidth="1.4" />

      {/* eyes — blink on a loop, and track the gaze */}
      <motion.g
        animate={{ x: look }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
      >
        {[17, 31].map((cx) => (
          <motion.ellipse
            key={cx}
            cx={cx}
            cy="21"
            rx="2.1"
            ry="2.4"
            fill="var(--text)"
            animate={{ ry: [2.4, 2.4, 0.3, 2.4] }}
            transition={{
              duration: 4.2,
              // Offset per eye position so two faces never blink in lockstep.
              delay: (cx % 7) * 0.6,
              repeat: Infinity,
              times: [0, 0.92, 0.96, 1],
            }}
          />
        ))}
      </motion.g>

      {/* brows */}
      {[13.5, 27].map((x, i) => (
        <motion.line
          key={x}
          x1={x} x2={x + 7.5}
          y1={browY} y2={browY}
          stroke={skin.ring}
          strokeWidth="1.6"
          strokeLinecap="round"
          style={{ originX: `${x + 3.75}px`, originY: `${browY}px` }}
          animate={{ rotate: i === 0 ? browTilt : -browTilt, y: thinking ? -1.2 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        />
      ))}

      {/* mouth — an open, moving shape only while actually speaking */}
      {speaking ? (
        <motion.ellipse
          cx="24" cy="31"
          fill="var(--text)"
          opacity={0.85}
          animate={{ rx: [3.4, 5, 3.8, 5.4, 3.4], ry: [1.6, 3.6, 2, 4.2, 1.6] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <motion.path
          fill="none"
          stroke={skin.ring}
          strokeWidth="1.7"
          strokeLinecap="round"
          animate={{
            d: conceded
              ? "M 18 31 Q 24 34.5 30 31"
              : mood === "positive"
                ? "M 18 30.5 Q 24 34 30 30.5"
                : mood === "negative"
                  ? "M 18 32.5 Q 24 29 30 32.5"
                  : "M 18 31.5 L 30 31.5",
          }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
      )}

      {/* a small nod when an agent concedes — the moment worth noticing */}
      {conceded && (
        <motion.circle
          cx="38" cy="11" r="4.5"
          fill="var(--go)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
        />
      )}
      {conceded && (
        <motion.path
          d="M 36 11 l 1.4 1.5 l 2.6 -3"
          fill="none" stroke="var(--ground)" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.12, duration: 0.25 }}
        />
      )}

      {/* thinking dots, while a turn is still in flight */}
      {thinking && !speaking && (
        <g>
          {[19, 24, 29].map((cx, i) => (
            <motion.circle
              key={cx}
              cx={cx} cy="31" r="1.1"
              fill={skin.ring}
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </g>
      )}
    </motion.svg>
  );
}
