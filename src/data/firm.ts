import type { Firm } from "@/lib/types";

// ============================================================================
// FIRM SEED DATA — Track B owns this file.
//
// ACCURACY NOTE: the Anti-Portfolio Skeptic seat carries 20% of the vote and
// argues from a firm's real past misses. Bessemer is the default firm because
// its anti-portfolio is genuinely public and self-published (bvp.com/anti-portfolio)
// — every entry below is a real, quotable pass. a16z is included as an
// alternative, but its antiPortfolio is empty: their passes are not publicly
// documented, and inventing specific misses for a real firm would be putting
// false claims in a named company's mouth. With a16z selected, the Skeptic
// falls back to thesis-mismatch reasoning instead of cited history.
//
// All personas are firm-level. No named real individuals speak in this app.
// ============================================================================

export const BESSEMER: Firm = {
  id: "bessemer",
  name: "Bessemer Venture Partners",
  hqHubId: "sf",
  thesis: [
    "Cloud and vertical SaaS compound: recurring revenue with real retention beats one-time capture.",
    "We publish roadmaps before we write cheques — if a market has no thesis, we have no conviction.",
    "Efficient growth over growth at any cost; we underwrite to net revenue retention, not to burn.",
    "Developer-first and bottoms-up adoption tends to beat top-down enterprise sales motions.",
    "We have been investing since 1911. We have survived being wrong, and we publish when we are.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [1_000_000, 50_000_000],
  sectorAppetite: {
    saas: 0.9,
    devtools: 0.8,
    fintech: 0.6,
    healthcare: 0.6,
    marketplace: 0.4,
    ai: 0.7,
    consumer: -0.2,
    hardware: -0.4,
    crypto: -0.3,
  },
  knownFor: [
    "The State of the Cloud report and the BVP Nasdaq Emerging Cloud Index",
    "Publishing their own investment roadmaps",
    "Publicly maintaining an anti-portfolio of the deals they got wrong",
  ],
  antiPortfolio: [
    {
      company: "Apple",
      whyPassed:
        "Offered pre-IPO secondary at a $60M valuation and called it outrageously expensive.",
      outcome: "Among the most valuable companies ever created.",
    },
    {
      company: "Google",
      whyPassed:
        "A partner's friend rented her Menlo Park garage to the founders; he asked how he could get out of the house without going anywhere near the garage.",
      outcome: "Defined an entire era of the internet.",
    },
    {
      company: "Facebook",
      whyPassed:
        "Told the pitching co-founder to move on because Friendster already existed.",
      outcome: "Over a billion users.",
    },
    {
      company: "eBay",
      whyPassed:
        "Stamps, coins and comic books were dismissed as a no-brainer pass.",
      outcome: "Defined online marketplaces.",
    },
    {
      company: "FedEx",
      whyPassed: "Passed on the company seven separate times.",
      outcome: "Global logistics infrastructure.",
    },
    {
      company: "Airbnb",
      whyPassed: "The idea was judged too crazy in 2009.",
      outcome: "Reinvented travel lodging.",
    },
  ],
  decisionStyle: "thesis-driven",
};

export const A16Z: Firm = {
  id: "a16z",
  name: "Andreessen Horowitz",
  hqHubId: "sf",
  thesis: [
    "Software is eating the world; every industry becomes a software industry.",
    "We back founders with strong opinions about a future most people think is wrong.",
    "Full-stack support — talent, go-to-market, policy — is the product we sell to founders.",
    "Market size is the constraint that binds: we would rather be wrong on team than on market.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [500_000, 100_000_000],
  sectorAppetite: {
    ai: 1.0,
    crypto: 0.8,
    saas: 0.6,
    fintech: 0.7,
    healthcare: 0.5,
    consumer: 0.6,
    marketplace: 0.5,
    devtools: 0.7,
    hardware: 0.2,
  },
  knownFor: [
    "Large multi-stage funds and an in-house operating team",
    "Publishing prolifically on their own theses",
    "American Dynamism, AI and crypto as declared focus areas",
  ],
  // Intentionally empty — see ACCURACY NOTE above.
  antiPortfolio: [],
  decisionStyle: "conviction",
};

export const FIRMS: Record<string, Firm> = {
  bessemer: BESSEMER,
  a16z: A16Z,
};

/** The firm the IC meeting runs against. Swap to "a16z" to change the room. */
export const ACTIVE_FIRM_ID = "bessemer";

export function getActiveFirm(): Firm {
  return FIRMS[ACTIVE_FIRM_ID];
}

export const SIMULATION_DISCLAIMER =
  "AI simulation. Not affiliated with, endorsed by, or representing this firm. " +
  "Partner personas are composites, not real individuals.";
