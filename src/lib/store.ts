"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentVerdict, VentureFile } from "@/lib/types";
import type { CrowdVerdict } from "@/lib/discovery/types";
import type { CrowdSignals } from "@/lib/discovery/signals";

/** The subset of a deployed person the globe needs to redraw them. Kept
 *  deliberately small, 120 of these are written to localStorage. */
export type DeployedSnapshot = {
  id: number;
  name: string;
  figure: string;
  title: string;
  label?: string;
  hubId: string;
  lat: number;
  lon: number;
  why: string[];
};

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
// VENTURE FILE STORE, shared. Track A adds discovery fields, Track B adds
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

const KEY = "vision.session";
/** Where this store lived before the rename. */
const LEGACY_KEY = "atlas.ventureFile";

/**
 * Reads fall back to the pre-rename key, so a session started before the
 * rename is picked up rather than lost; the first write retires the old key.
 *
 * zustand's `migrate` cannot do this on its own. It only ever sees data
 * stored under the current name, which is why the rename quietly dropped
 * every earlier session while the comment below said it kept them.
 */
export function withLegacyFallback(store: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  return {
    getItem: (name: string) =>
      store.getItem(name) ?? (name === KEY ? store.getItem(LEGACY_KEY) : null),
    setItem: (name: string, value: string) => {
      store.setItem(name, value);
      if (name === KEY) store.removeItem(LEGACY_KEY);
    },
    removeItem: (name: string) => store.removeItem(name),
  };
}

type State = {
  ventureFile: VentureFile | null;
  deliberation: DeliberationSnapshot | null;
  setDeliberation: (d: DeliberationSnapshot) => void;
  /** What the crowd concluded. The report grades the idea from these numbers,
   *  so advice can cite what was measured rather than restating the problem. */
  crowd: { verdict: CrowdVerdict; signals: CrowdSignals | null } | null;
  /** Who was asked, so Part 1 can redraw the globe after you navigate away and
   *  come back. The crowd verdict alone cannot. It has reactions but no
   *  coordinates, and no way to map a persona id to a city. */
  deployed: DeployedSnapshot[] | null;
  setDeployed: (people: DeployedSnapshot[]) => void;
  setCrowd: (verdict: CrowdVerdict, signals: CrowdSignals | null) => void;
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
      crowd: null,
      deployed: null,

      setCrowd: (verdict, signals) => set({ crowd: { verdict, signals } }),
      setDeployed: (deployed) => set({ deployed }),
      firmId: "bessemer",

      setFirmId: (firmId) => set({ firmId, deliberation: null }),

      setDeliberation: (deliberation) => set({ deliberation }),

      start: (solution) =>
        set({
          ventureFile: newVentureFile(solution),
          deliberation: null,
          crowd: null,
          deployed: null,
        }),

      update: (patch) => {
        const current = get().ventureFile;
        if (!current) return;
        set({ ventureFile: { ...current, ...patch, version: current.version + 1 } });
      },

      replace: (vf) => set({ ventureFile: vf }),

      reset: () =>
        set({ ventureFile: null, deliberation: null, crowd: null, deployed: null }),
    }),
    {
      name: KEY,
      version: 1,
      // Renamed from atlas.ventureFile, which was unversioned (0). The storage
      // hands its data over under the new name, and this accepts it as is.
      storage: createJSONStorage(() => withLegacyFallback(localStorage)),
      migrate: (state) => state as State,
    }
  )
);
