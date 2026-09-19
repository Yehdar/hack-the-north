"use client";

import { useId } from "react";
import { motion } from "framer-motion";

// ============================================================================
// AGENT FACES.
//
// The council graph was labelled circles with a number in them. Circles do not
// look like they are arguing. You have to read the graph to know anything is
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

const SKIN: Record<FaceMood, { fill: string; ring: string; blush: number }> = {
  positive: { fill: "rgba(63,185,80,0.2)", ring: "var(--go)", blush: 0.38 },
  neutral: { fill: "rgba(148,161,184,0.17)", ring: "var(--border-bright)", blush: 0.2 },
  negative: { fill: "rgba(229,83,75,0.2)", ring: "var(--stop)", blush: 0.14 },
};

// Resting mouths. Even the sceptic's frown is mild and the neutral face has
// the ghost of a smile: these are colleagues disagreeing, not enemies.
const MOUTH: Record<FaceMood | "conceded", string> = {
  conceded: "M 19 30.5 Q 24 34.6 29 30.5",
  positive: "M 18 30 Q 24 35.2 30 30",
  neutral: "M 19.5 31.6 Q 24 33 28.5 31.6",
  negative: "M 19.5 32.8 Q 24 30 28.5 32.8",
};

const BLINK = { duration: 4.2, repeat: Infinity, times: [0, 0.92, 0.96, 1] };

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
  const look = Math.max(-1, Math.min(1, gaze));

  // A blink offset per face, so the room never blinks in lockstep. Derived
  // from React's instance id rather than Math.random, which would differ
  // between the server render and hydration.
  const id = useId();
  let hash = 7;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const blinkAt = (hash / 997) * BLINK.duration;

  // Brows carry the stance: down and angled in for a sceptic, lifted for
  // someone who likes what they are hearing. Short and soft either way.
  const browY = mood === "negative" ? 15.2 : mood === "positive" ? 12.8 : 14;
  const browTilt = mood === "negative" ? 6 : mood === "positive" ? -4 : 0;

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

      <circle cx="24" cy="24" r="19.5" fill={skin.fill} stroke={skin.ring} strokeWidth="1.3" />
      {/* a soft sheen, top left, so the head reads as round rather than flat */}
      <ellipse cx="17" cy="14.5" rx="7" ry="4.2" fill="#fff" opacity="0.07" transform="rotate(-28 17 14.5)" />

      {/* cheeks. Warmer the more this agent likes what it hears */}
      {[13.2, 34.8].map((cx) => (
        <motion.circle
          key={cx}
          cx={cx} cy="28.2" r="2.7"
          fill="#f2a0b4"
          initial={false}
          animate={{ opacity: skin.blush }}
          transition={{ duration: 0.4 }}
        />
      ))}

      {/* eyes. Big and round, blink on a loop, pupils track the gaze */}
      <motion.g
        animate={{ x: look * 0.8 }}
        transition={{ type: "spring", stiffness: 180, damping: 18 }}
      >
        {[18, 30].map((cx) => (
          <g key={cx}>
            <motion.ellipse
              cx={cx}
              cy="22"
              rx="3.3"
              ry="3.7"
              fill="var(--text)"
              initial={{ ry: 3.7 }}
              animate={{ ry: [3.7, 3.7, 0.35, 3.7] }}
              transition={{ ...BLINK, delay: blinkAt }}
            />
            <motion.circle
              cy="22.5"
              r="1.6"
              fill="var(--ground)"
              initial={{ cx, opacity: 1 }}
              animate={{ cx: cx + look * 1.2, opacity: [1, 1, 0, 1] }}
              transition={{
                cx: { type: "spring", stiffness: 180, damping: 18 },
                opacity: { ...BLINK, delay: blinkAt },
              }}
            />
          </g>
        ))}
      </motion.g>

      {/* brows */}
      {[14.6, 26.6].map((x, i) => (
        <motion.line
          key={x}
          x1={x} x2={x + 6.8}
          y1={browY} y2={browY}
          stroke={skin.ring}
          strokeWidth="1.4"
          strokeLinecap="round"
          style={{ originX: `${x + 3.4}px`, originY: `${browY}px` }}
          animate={{ rotate: i === 0 ? browTilt : -browTilt, y: thinking ? -1.2 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
        />
      ))}

      {/* mouth. An open, moving shape only while actually speaking, and
          thinking dots in its place while a turn is still in flight */}
      {speaking ? (
        <motion.ellipse
          cx="24" cy="31.4"
          fill="var(--text)"
          opacity={0.85}
          initial={{ rx: 3.2, ry: 1.6 }}
          animate={{ rx: [3.2, 4.6, 3.6, 5, 3.2], ry: [1.6, 3.4, 2, 3.9, 1.6] }}
          transition={{ duration: 0.62, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : thinking ? (
        <g>
          {[20, 24, 28].map((cx, i) => (
            <motion.circle
              key={cx}
              cx={cx} cy="31.5" r="1.2"
              fill={skin.ring}
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </g>
      ) : (
        <motion.path
          fill="none"
          stroke={skin.ring}
          strokeWidth="1.7"
          strokeLinecap="round"
          // framer-motion has no starting value to read for an SVG path and
          // writes the string "undefined" into it on mount; start on the shape.
          initial={{ d: MOUTH[conceded ? "conceded" : mood] }}
          animate={{ d: MOUTH[conceded ? "conceded" : mood] }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        />
      )}

      {/* a small nod when an agent concedes. The moment worth noticing */}
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
    </motion.svg>
  );
}
