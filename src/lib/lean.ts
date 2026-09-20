import type { AgentVerdict } from "@/lib/types";
import type { WeightMap } from "@/lib/verdict";
import { computeScore } from "@/lib/verdict";

// ============================================================================
// WHERE THE ROOM STANDS.
//
// A lean, deliberately, and not a number out of a hundred.
//
// A score invites a founder to optimise the figure instead of listening to the
// argument under it, and it claims a precision five simulated partners do not
// have. "Leaning against, and one of them is immovable" is both more honest
// and more useful than 43.
//
// Pure, so the room's position can be re-read after every exchange without
// calling anything.
// ============================================================================

export type Lean = "for" | "leaning-for" | "split" | "leaning-against" | "against";

export const LEAN_TONE: Record<Lean, { label: string; color: string; note: string }> = {
  for: {
    label: "Behind it",
    color: "var(--go)",
    note: "The room would back this today.",
  },
  "leaning-for": {
    label: "Warming to it",
    color: "var(--go)",
    note: "More for than against, but nobody has committed.",
  },
  split: {
    label: "Split",
    color: "var(--caution)",
    note: "No agreement yet. This is where a conversation counts most.",
  },
  "leaning-against": {
    label: "Leaning against",
    color: "var(--caution)",
    note: "The doubts are winning. Something specific has to change.",
  },
  against: {
    label: "Against it",
    color: "var(--stop)",
    note: "As it stands the room would pass.",
  },
};

export type LeanVote = Pick<AgentVerdict, "agentId" | "stance" | "confidence">;

export function leanOf(votes: LeanVote[], weights: WeightMap): Lean {
  if (votes.length === 0) return "split";

  const score = computeScore(votes as AgentVerdict[], weights);
  if (score >= 0.45) return "for";
  if (score >= 0.15) return "leaning-for";
  if (score > -0.15) return "split";
  if (score > -0.45) return "leaning-against";
  return "against";
}

/** Each seat's own weight, which is what the room actually votes by. */
export function weightsOf(roster: { id: string; weight: number }[]): WeightMap {
  return Object.fromEntries(
    roster.filter((r) => r.weight > 0).map((r) => [r.id, r.weight])
  );
}

/**
 * How a conversation moved someone.
 *
 * Only reports a real move. Rounding noise from a re-read is not a change of
 * mind, and saying it was would make the indicator lie.
 */
export function moveOf(before: number | undefined, after: number | undefined): {
  moved: boolean;
  direction: "toward" | "away" | "none";
  size: number;
} {
  if (before === undefined || after === undefined) {
    return { moved: false, direction: "none", size: 0 };
  }
  const delta = after - before;
  if (Math.abs(delta) < 0.08) return { moved: false, direction: "none", size: 0 };
  return {
    moved: true,
    direction: delta > 0 ? "toward" : "away",
    size: Math.abs(delta),
  };
}
