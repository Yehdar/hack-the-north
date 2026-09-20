import type { CrowdVerdict } from "./types";

// ============================================================================
// HUB RANKING, computed on the client from reactions already in hand.
//
// Pure and shared: Part 1 calls it the moment the crowd lands, and Part 2
// calls it again from the same persisted verdict so the boardroom can show
// the identical breakdown without a round trip or a second copy of the maths.
// ============================================================================

export type HubRank = {
  hubId: string;
  fitScore: number;
  asked: number;
  haveIt: number;
  wouldPay: number;
};

/** The minimum a caller needs per person: which hub they were asked in. */
export type HubbedPersona = { id: number; hubId: string };

export function rankFromCrowd(crowd: CrowdVerdict, personas: HubbedPersona[]): HubRank[] {
  const hubOf = new Map(personas.map((p) => [p.id, p.hubId]));
  const rows = new Map<string, { asked: number; haveIt: number; pay: number; severity: number }>();

  for (const r of crowd.reactions) {
    const hubId = hubOf.get(r.personaId);
    if (!hubId) continue;
    const row = rows.get(hubId) ?? { asked: 0, haveIt: 0, pay: 0, severity: 0 };
    row.asked++;
    if (r.problemId === crowd.marketProblemId) {
      row.haveIt++;
      row.severity += r.problemSeverity;
      if (r.wouldPay) row.pay++;
    }
    rows.set(hubId, row);
  }

  return [...rows.entries()]
    .map(([hubId, row]) => {
      const incidence = row.asked ? row.haveIt / row.asked : 0;
      const payRate = row.haveIt ? row.pay / row.haveIt : 0;
      const meanSeverity = row.haveIt ? row.severity / row.haveIt : 0;
      return {
        hubId,
        fitScore: Math.round(incidence * 55 + payRate * 30 + (meanSeverity / 100) * 15),
        asked: row.asked,
        haveIt: row.haveIt,
        wouldPay: row.pay,
      };
    })
    // A city where we asked almost nobody is not a finding.
    .filter((h) => h.asked >= 3)
    .sort((a, b) => b.fitScore - a.fitScore);
}
