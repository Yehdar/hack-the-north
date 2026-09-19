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


// ---------------------------------------------------------------------------
// The rest of the room. Every thesis below is drawn from what these firms say
// publicly about themselves. antiPortfolio stays empty for all of them — only
// one firm in venture actually publishes its misses, and inventing specific
// passes for a named company would be putting false claims in its mouth.
// With any of these selected, the Skeptic argues thesis mismatch instead.
// ---------------------------------------------------------------------------

export const SEQUOIA: Firm = {
  id: "sequoia",
  name: "Sequoia Capital",
  hqHubId: "sf",
  thesis: [
    "We partner with founders from idea to IPO and stay for decades, not for a fund cycle.",
    "The best companies are built by people obsessed with a problem, not with starting a company.",
    "Enduring market leadership beats early momentum; we underwrite to what this looks like in ten years.",
    "A small team that ships beats a large team that plans.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [500_000, 100_000_000],
  sectorAppetite: { ai: 0.9, saas: 0.8, fintech: 0.7, healthcare: 0.6, consumer: 0.6, devtools: 0.7, marketplace: 0.6, crypto: 0.2, hardware: 0.3 },
  knownFor: ["Backing category-defining companies early", "Long-hold conviction", "Publishing market perspectives"],
  antiPortfolio: [],
  decisionStyle: "conviction",
};

export const YC: Firm = {
  id: "yc",
  name: "Y Combinator",
  hqHubId: "sf",
  thesis: [
    "Make something people want. Everything else is a distraction from that.",
    "Talk to users and write code. Nothing else counts as progress.",
    "Launch before you are ready; the market corrects you faster than you correct yourself.",
    "Default alive beats default fundable.",
  ],
  stages: ["pre-seed", "seed"],
  checkSize: [125_000, 500_000],
  sectorAppetite: { ai: 0.9, devtools: 0.8, saas: 0.8, fintech: 0.7, healthcare: 0.6, marketplace: 0.7, consumer: 0.6, hardware: 0.4, crypto: 0.3 },
  knownFor: ["Batch model", "Growth-rate focus", "Relentless user-contact discipline"],
  antiPortfolio: [],
  decisionStyle: "metrics-first",
};

export const ACCEL: Firm = {
  id: "accel",
  name: "Accel",
  hqHubId: "sf",
  thesis: [
    "Prepared minds: we study a category before we meet the founder working in it.",
    "Global from the start — the next category leader is as likely to be in Bangalore or London as in California.",
    "Efficient growth compounds; growth bought with burn does not.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [1_000_000, 50_000_000],
  sectorAppetite: { saas: 0.9, devtools: 0.8, fintech: 0.8, ai: 0.8, marketplace: 0.7, commerce: 0.6, healthcare: 0.5, consumer: 0.5, crypto: 0.1 },
  knownFor: ["The prepared-mind approach", "Early global expansion", "Enterprise software depth"],
  antiPortfolio: [],
  decisionStyle: "thesis-driven",
};

export const FOUNDERS_FUND: Firm = {
  id: "foundersfund",
  name: "Founders Fund",
  hqHubId: "sf",
  thesis: [
    "We wanted flying cars and got 140 characters. Back the ambitious version.",
    "Competition is for losers; a real company escapes comparison entirely.",
    "Contrarian and right is the only position that pays. Consensus is already priced in.",
    "Hard technology with long timelines is underfunded precisely because it is hard.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [1_000_000, 100_000_000],
  sectorAppetite: { ai: 0.9, hardware: 0.8, energy: 0.7, healthcare: 0.7, fintech: 0.6, crypto: 0.7, saas: 0.4, consumer: 0.4, commerce: 0.2 },
  knownFor: ["Contrarian mandate", "Deep tech and defence", "Concentrated positions"],
  antiPortfolio: [],
  decisionStyle: "conviction",
};

export const INDEX: Firm = {
  id: "index",
  name: "Index Ventures",
  hqHubId: "london",
  thesis: [
    "Great companies come from everywhere; we have backed them from Stockholm to São Paulo.",
    "Founder-first, and specific: we index on the person's insight into their own market.",
    "Software eats verticals one workflow at a time. Own the workflow, not the category name.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [1_000_000, 60_000_000],
  sectorAppetite: { saas: 0.9, fintech: 0.8, ai: 0.8, devtools: 0.7, commerce: 0.7, marketplace: 0.7, healthcare: 0.5, consumer: 0.6, crypto: 0.3 },
  knownFor: ["European and global reach", "Vertical software depth", "Founder-first posture"],
  antiPortfolio: [],
  decisionStyle: "consensus",
};

export const GENERAL_CATALYST: Firm = {
  id: "generalcatalyst",
  name: "General Catalyst",
  hqHubId: "nyc",
  thesis: [
    "Responsible innovation: growth that a regulator, a patient or a customer would also call good.",
    "We back companies that change how an entire industry operates, not features on top of one.",
    "Health, defence and financial infrastructure are where durable value is currently mispriced.",
  ],
  stages: ["seed", "series-a", "series-b", "growth"],
  checkSize: [1_000_000, 100_000_000],
  sectorAppetite: { healthcare: 0.9, fintech: 0.8, ai: 0.8, saas: 0.7, government: 0.6, energy: 0.6, devtools: 0.5, consumer: 0.4, crypto: 0.1 },
  knownFor: ["Health system transformation", "Long-duration capital", "Responsible innovation framing"],
  antiPortfolio: [],
  decisionStyle: "thesis-driven",
};

export const FIRMS: Record<string, Firm> = {
  bessemer: BESSEMER,
  a16z: A16Z,
  sequoia: SEQUOIA,
  yc: YC,
  accel: ACCEL,
  foundersfund: FOUNDERS_FUND,
  index: INDEX,
  generalcatalyst: GENERAL_CATALYST,
};

/**
 * Default room. Bessemer leads because its anti-portfolio is genuinely public,
 * which is the only thing that gives the Skeptic seat real cited history to
 * argue from — see the accuracy note above.
 */
export const ACTIVE_FIRM_ID = "bessemer";

export function getActiveFirm(firmId?: string): Firm {
  return (firmId && FIRMS[firmId]) || FIRMS[ACTIVE_FIRM_ID];
}

/** For the firm picker. Ordered with the one that has real cited misses first. */
export function listFirms() {
  return Object.values(FIRMS).map((f) => ({
    id: f.id,
    name: f.name,
    stages: f.stages,
    checkSize: f.checkSize,
    decisionStyle: f.decisionStyle,
    thesis: f.thesis[0],
    hasAntiPortfolio: f.antiPortfolio.length > 0,
  }));
}

export const SIMULATION_DISCLAIMER =
  "AI simulation. Not affiliated with, endorsed by, or representing this firm. " +
  "Partner personas are composites, not real individuals.";
