import type { Firm } from "@/lib/types";
import { FIRMS, FIRM_LIST, firmsInHub } from "./firms";

// Thin surface over the firm data so existing call sites keep working.
// The data itself, and the accuracy note that governs it, lives in ./firms.ts.

export { FIRMS, FIRM_LIST, firmsInHub };

/**
 * Default room. Bessemer leads because its anti-portfolio is genuinely public,
 * which is the only thing that gives the Skeptic seat real cited history to
 * argue from.
 */
export const ACTIVE_FIRM_ID = "bessemer";

export function getActiveFirm(firmId?: string): Firm {
  return (firmId && FIRMS[firmId]) || FIRMS[ACTIVE_FIRM_ID];
}

/** For the firm picker, grouped so a founder can see the room by region. */
export function listFirms() {
  return FIRM_LIST.map((f) => ({
    id: f.id,
    name: f.name,
    hqHubId: f.hqHubId,
    stages: f.stages,
    checkSize: f.checkSize,
    decisionStyle: f.decisionStyle,
    thesis: f.thesis[0],
    hasAntiPortfolio: f.antiPortfolio.length > 0,
  }));
}

export const SIMULATION_DISCLAIMER =
  "AI simulation. Not affiliated with, endorsed by, or representing these firms. " +
  "Partner personas are composites, not real individuals.";
