"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentVerdict, VentureFile } from "@/lib/types";

/** Track B's deliberation output. Not part of the frozen VentureFile contract —
 *  Track A neither reads nor writes this. */
export type DeliberationSnapshot = {
  firm: string;
  verdicts: AgentVerdict[];
  messages: { id: string; round: number; from: string; to: string; kind: string; text: string }[];
  roster: { id: string; role: string; weight: number }[];
  metrics: {
    challenges: number;
    rebuttals: number;
    concessions: number;
    convergence: number;
    varianceByRound: number[];
    mindChanges: { agentId: string; from: number; to: number; conceded: boolean }[];
  };
};

// ============================================================================
// VENTURE FILE STORE — shared. Track A adds discovery fields, Track B adds
// defense fields, neither clobbers the other's half.
//
// Persisted to localStorage so a refresh mid-demo does not lose the pitch, and
// so the meeting page and the globe page are looking at the same file without
// a server session to go wrong.
// ============================================================================

export function newVentureFile(solution: string): VentureFile {
  return {
    id: `vf_${Date.now().toString(36)}`,
    version: 1,
    solution: solution.trim(),
    extractedProblems: [],
    hubFindings: {},
    pitchTranscript: [],
    objections: [],
  };
}

type State = {
  ventureFile: VentureFile | null;
  deliberation: DeliberationSnapshot | null;
  setDeliberation: (d: DeliberationSnapshot) => void;
  /** Which firm's committee you are pitching to. */
  firmId: string;
  setFirmId: (id: string) => void;
  /** Set a brand new file from the founder's own words. */
  start: (solution: string) => void;
  /** Merge a server-returned file. Version bumps invalidate agent caches. */
  update: (patch: Partial<VentureFile>) => void;
  replace: (vf: VentureFile) => void;
  reset: () => void;
};

export const useVenture = create<State>()(
  persist(
    (set, get) => ({
      ventureFile: null,
      deliberation: null,
      firmId: "bessemer",

      setFirmId: (firmId) => set({ firmId, deliberation: null }),

      setDeliberation: (deliberation) => set({ deliberation }),

      start: (solution) =>
        set({ ventureFile: newVentureFile(solution), deliberation: null }),

      update: (patch) => {
        const current = get().ventureFile;
        if (!current) return;
        set({ ventureFile: { ...current, ...patch, version: current.version + 1 } });
      },

      replace: (vf) => set({ ventureFile: vf }),

      reset: () => set({ ventureFile: null, deliberation: null }),
    }),
    {
      name: "vision.session",
      version: 1,
      // Renamed from atlas.ventureFile. Anyone mid-run when this shipped keeps
      // their work rather than silently losing it.
      migrate: (state) => state as State,
    }
  )
);
