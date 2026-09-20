"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";
import type { Minutes } from "@/lib/minutes";

// ============================================================================
// SAVED RUNS.
//
// A founder does not run this once. They run it, learn the market has a
// different problem, rewrite the idea, and run it again. And the comparison
// between those two runs is worth more than either one alone.
//
// Stored as summaries rather than whole runs: reactions from three hundred
// people would fill localStorage in a handful of sessions, and nothing on the
// dashboard needs them. What is kept is what a founder would actually compare.
// ============================================================================

export type SessionSummary = {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** The founder's own words, at the time of the run. */
  solution: string;

  // Part 1
  crowdSize: number;
  problemCount: number;
  pitchedProblem?: string;
  marketProblem?: string;
  mismatch: boolean;
  meanSentiment: number;
  engaged: number;
  warning: string | null;
  topHub?: { hubId: string; fitScore: number };
  pvs?: number;
  pvsPassed?: boolean;

  // Part 2
  firmId?: string;
  firmName?: string;
  decision?: "invest" | "conditional" | "pass";
  score?: number;
  killShot?: string;
  /** The chair's record of the meeting, rewritten after the pitch. */
  minutes?: Minutes;

  /** Set when this run followed another, the refine loop. */
  parentId?: string;
};

type State = {
  sessions: SessionSummary[];
  activeId: string | null;

  /** Starts a new saved run. `parentId` links a re-run to what it came from. */
  begin: (solution: string, parentId?: string) => string;
  /** Merges into a run. The active one unless `id` names another. A stream
   *  that outlives a navigation must write to the run it started, not to
   *  whichever run is active by the time it finishes. */
  record: (patch: Partial<SessionSummary>, id?: string) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  clear: () => void;
};

export const useSessions = create<State>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeId: null,

      begin: (solution, parentId) => {
        const id = `s_${Date.now().toString(36)}`;
        const now = Date.now();
        const session: SessionSummary = {
          id,
          createdAt: now,
          updatedAt: now,
          solution: solution.trim(),
          crowdSize: 0,
          problemCount: 0,
          mismatch: false,
          meanSentiment: 0,
          engaged: 0,
          warning: null,
          parentId,
        };
        set({ sessions: [session, ...get().sessions].slice(0, 40), activeId: id });
        return id;
      },

      record: (patch, id) => {
        const target = id ?? get().activeId;
        if (!target) return;
        set({
          sessions: get().sessions.map((s) =>
            s.id === target ? { ...s, ...patch, updatedAt: Date.now() } : s
          ),
        });
      },

      remove: (id) =>
        set({
          sessions: get().sessions.filter((s) => s.id !== id),
          activeId: get().activeId === id ? null : get().activeId,
        }),

      setActive: (activeId) => set({ activeId }),
      clear: () => set({ sessions: [], activeId: null }),
    }),
    { name: "vision.sessions" }
  )
);

/**
 * Lands a Part 2 result on the saved run it belongs to. The active run, and
 * only when that run is the idea actually being pitched. Otherwise a committee
 * convened on some other idea would overwrite a run it has nothing to do with.
 */
export function recordVerdict(solution: string, patch: Partial<SessionSummary>) {
  const { sessions, activeId, record } = useSessions.getState();
  const active = sessions.find((s) => s.id === activeId);
  if (active && active.solution === solution.trim()) record(patch, active.id);
}

/** Everything a crowd run establishes, folded into one patch. */
export function summariseCrowd(
  verdict: CrowdVerdict,
  /** Null when the crowd was graded in the browser after its stream stalled:
   *  who-responded needs the persona library, which lives on the server. */
  signals: CrowdSignals | null,
  problems: { id: string; statement: string }[],
  crowdSize: number
): Partial<SessionSummary> {
  const find = (id: string | null) =>
    id ? problems.find((p) => p.id === id)?.statement : undefined;

  return {
    crowdSize,
    problemCount: problems.length,
    pitchedProblem: find(verdict.pitchedProblemId),
    marketProblem: find(verdict.marketProblemId),
    mismatch: verdict.mismatch,
    meanSentiment: verdict.meanSentiment,
    engaged: signals?.engaged ?? verdict.attention.full,
    warning: signals?.warning ?? null,
  };
}

/**
 * What changed between a run and the one it came from. Only the fields a
 * founder would actually check. A full diff is noise.
 */
export type SessionDelta = {
  field: string;
  before: string;
  after: string;
  better: boolean | null;
};

export function diffSessions(prev: SessionSummary, next: SessionSummary): SessionDelta[] {
  const out: SessionDelta[] = [];

  if (prev.marketProblem !== next.marketProblem) {
    out.push({
      field: "The market's problem",
      before: prev.marketProblem ?? "—",
      after: next.marketProblem ?? "—",
      better: null,
    });
  }

  if (prev.mismatch !== next.mismatch) {
    out.push({
      field: "Pitched vs market",
      before: prev.mismatch ? "mismatched" : "aligned",
      after: next.mismatch ? "mismatched" : "aligned",
      // Alignment after a rewrite means the founder absorbed the finding.
      better: !next.mismatch,
    });
  }

  if (Math.abs(prev.meanSentiment - next.meanSentiment) > 0.02) {
    out.push({
      field: "Mean sentiment",
      before: prev.meanSentiment.toFixed(2),
      after: next.meanSentiment.toFixed(2),
      better: next.meanSentiment > prev.meanSentiment,
    });
  }

  if (prev.engaged !== next.engaged) {
    out.push({
      field: "Paid full attention",
      before: String(prev.engaged),
      after: String(next.engaged),
      better: next.engaged > prev.engaged,
    });
  }

  if (prev.pvs !== undefined && next.pvs !== undefined && prev.pvs !== next.pvs) {
    out.push({
      field: "Validation score",
      before: String(prev.pvs),
      after: String(next.pvs),
      better: next.pvs > prev.pvs,
    });
  }

  if (prev.decision !== next.decision && next.decision) {
    const rank = { pass: 0, conditional: 1, invest: 2 } as const;
    out.push({
      field: "Committee",
      before: prev.decision ?? "—",
      after: next.decision,
      better: prev.decision ? rank[next.decision] > rank[prev.decision] : null,
    });
  }

  return out;
}
