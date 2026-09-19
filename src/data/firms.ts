import type { Firm, Stage } from "@/lib/types";

// ============================================================================
// THE FIRMS — one or more per major hub, so the committee you face reflects
// where you decided to build.
//
// ACCURACY NOTE, and it matters: every thesis below is drawn from what these
// firms say publicly about themselves. `antiPortfolio` is populated for exactly
// one firm, because exactly one firm in venture publishes its misses. Inventing
// specific passes for a named company would be putting false claims in its
// mouth, so the others ship empty and the Skeptic seat argues thesis mismatch
// instead of citing history it does not have.
//
// All partner personas are composites. No real individual speaks in this app.
// ============================================================================

type Draft = {
  id: string;
  name: string;
  hqHubId: string;
  thesis: string[];
  stages?: Stage[];
  checkSize?: [number, number];
  appetite?: Record<string, number>;
  knownFor?: string[];
  style?: Firm["decisionStyle"];
  antiPortfolio?: Firm["antiPortfolio"];
};

function firm(d: Draft): Firm {
  return {
    id: d.id,
    name: d.name,
    hqHubId: d.hqHubId,
    thesis: d.thesis,
    stages: d.stages ?? ["seed", "series-a", "series-b"],
    checkSize: d.checkSize ?? [1_000_000, 30_000_000],
    sectorAppetite: d.appetite ?? {},
    knownFor: d.knownFor ?? [],
    antiPortfolio: d.antiPortfolio ?? [],
    decisionStyle: d.style ?? "thesis-driven",
  };
}

const DRAFTS: Draft[] = [
  // ---------------------------------------------------------------- Bay Area
  {
    id: "bessemer",
    name: "Bessemer Venture Partners",
    hqHubId: "sf",
    style: "thesis-driven",
    checkSize: [1_000_000, 50_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "Cloud and vertical software compound: recurring revenue with real retention beats one-time capture.",
      "We publish roadmaps before we write cheques. If a market has no thesis, we have no conviction.",
      "Efficient growth over growth at any cost; we underwrite to net revenue retention, not to burn.",
      "We have been investing since 1911. We have survived being wrong, and we publish when we are.",
    ],
    appetite: { saas: 0.9, devtools: 0.8, ai: 0.7, fintech: 0.6, healthcare: 0.6, consumer: -0.2, hardware: -0.4 },
    knownFor: ["The State of the Cloud report", "Publishing their own investment roadmaps", "Publicly maintaining an anti-portfolio"],
    antiPortfolio: [
      { company: "Apple", whyPassed: "Offered pre-IPO secondary at a $60M valuation and called it outrageously expensive.", outcome: "Among the most valuable companies ever created." },
      { company: "Google", whyPassed: "A partner's friend rented her Menlo Park garage to the founders; he asked how to get out of the house without going near the garage.", outcome: "Defined an era of the internet." },
      { company: "Facebook", whyPassed: "Told the pitching co-founder to move on because Friendster already existed.", outcome: "Over a billion users." },
      { company: "eBay", whyPassed: "Stamps, coins and comic books were dismissed as a no-brainer pass.", outcome: "Defined online marketplaces." },
      { company: "FedEx", whyPassed: "Passed seven separate times.", outcome: "Global logistics infrastructure." },
      { company: "Airbnb", whyPassed: "The idea was judged too crazy in 2009.", outcome: "Reinvented travel lodging." },
    ],
  },
  {
    id: "a16z",
    name: "Andreessen Horowitz",
    hqHubId: "sf",
    style: "conviction",
    checkSize: [500_000, 100_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "Software is eating the world; every industry becomes a software industry.",
      "We back founders with strong opinions about a future most people think is wrong.",
      "Full-stack support — talent, go-to-market, policy — is the product we sell founders.",
      "Market size is the binding constraint. We would rather be wrong on team than on market.",
    ],
    appetite: { ai: 1.0, crypto: 0.8, fintech: 0.7, devtools: 0.7, saas: 0.6, consumer: 0.6, healthcare: 0.5 },
    knownFor: ["Large multi-stage funds", "In-house operating team", "Publishing prolifically"],
  },
  {
    id: "sequoia",
    name: "Sequoia Capital",
    hqHubId: "sf",
    style: "conviction",
    checkSize: [500_000, 100_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "We partner from idea to IPO and stay for decades, not for a fund cycle.",
      "The best companies are built by people obsessed with a problem, not with starting a company.",
      "Enduring market leadership beats early momentum.",
      "A small team that ships beats a large team that plans.",
    ],
    appetite: { ai: 0.9, saas: 0.8, fintech: 0.7, consumer: 0.6, healthcare: 0.6, devtools: 0.7 },
    knownFor: ["Backing category-definers early", "Long-hold conviction"],
  },
  {
    id: "yc",
    name: "Y Combinator",
    hqHubId: "sf",
    style: "metrics-first",
    checkSize: [125_000, 500_000],
    stages: ["pre-seed", "seed"],
    thesis: [
      "Make something people want. Everything else is a distraction from that.",
      "Talk to users and write code. Nothing else counts as progress.",
      "Launch before you are ready; the market corrects you faster than you correct yourself.",
      "Default alive beats default fundable.",
    ],
    appetite: { ai: 0.9, devtools: 0.8, saas: 0.8, fintech: 0.7, marketplace: 0.7, consumer: 0.6 },
    knownFor: ["Batch model", "Growth-rate discipline", "Relentless user contact"],
  },
  {
    id: "foundersfund",
    name: "Founders Fund",
    hqHubId: "sf",
    style: "conviction",
    checkSize: [1_000_000, 100_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "We wanted flying cars and got 140 characters. Back the ambitious version.",
      "Competition is for losers; a real company escapes comparison entirely.",
      "Contrarian and right is the only position that pays. Consensus is already priced in.",
      "Hard technology is underfunded precisely because it is hard.",
    ],
    appetite: { ai: 0.9, hardware: 0.8, energy: 0.7, healthcare: 0.7, crypto: 0.7, saas: 0.4, commerce: 0.2 },
    knownFor: ["Contrarian mandate", "Deep tech", "Concentrated positions"],
  },

  // ------------------------------------------------------------------ NY / US
  {
    id: "usv",
    name: "Union Square Ventures",
    hqHubId: "nyc",
    thesis: [
      "We invest in networks: value accrues to whoever owns the relationship, not the transaction.",
      "Thesis-driven and small by design. We write few cheques and we write them deliberately.",
      "Access to capital, knowledge and wellbeing is where durable networks now form.",
    ],
    appetite: { marketplace: 0.9, fintech: 0.8, consumer: 0.7, ai: 0.6, education: 0.6, healthcare: 0.6, hardware: -0.3 },
    knownFor: ["Network effects thesis", "Deliberately small funds", "Long-running public writing"],
  },
  {
    id: "generalcatalyst",
    name: "General Catalyst",
    hqHubId: "nyc",
    checkSize: [1_000_000, 100_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "Responsible innovation: growth a regulator, a patient or a customer would also call good.",
      "We back companies that change how an industry operates, not features on top of one.",
      "Health, defence and financial infrastructure are where durable value is mispriced.",
    ],
    appetite: { healthcare: 0.9, fintech: 0.8, ai: 0.8, saas: 0.7, government: 0.6, energy: 0.6 },
    knownFor: ["Health system transformation", "Long-duration capital"],
  },
  {
    id: "battery",
    name: "Battery Ventures",
    hqHubId: "boston",
    style: "metrics-first",
    thesis: [
      "We are as comfortable in an industrial plant as in a data centre.",
      "Application and infrastructure software with real unit economics, at any stage.",
      "Unglamorous markets with entrenched incumbents are where the returns hide.",
    ],
    appetite: { saas: 0.9, manufacturing: 0.7, logistics: 0.7, devtools: 0.7, fintech: 0.6, healthcare: 0.5 },
    knownFor: ["Industrial tech depth", "Stage-agnostic"],
  },

  // ------------------------------------------------------------------- Canada
  {
    id: "radical",
    name: "Radical Ventures",
    hqHubId: "toronto",
    thesis: [
      "AI is a general-purpose technology and we invest in it exclusively.",
      "Research depth is the moat. We back teams who can push the state of the art, not wrap it.",
      "Applied AI in regulated industries is where the defensibility actually is.",
    ],
    appetite: { ai: 1.0, healthcare: 0.7, devtools: 0.6, energy: 0.6, saas: 0.5, crypto: -0.4 },
    knownFor: ["AI-only mandate", "Deep research ties"],
  },
  {
    id: "golden",
    name: "Golden Ventures",
    hqHubId: "toronto",
    checkSize: [250_000, 5_000_000],
    stages: ["pre-seed", "seed"],
    thesis: [
      "Earliest-stage Canadian companies, backed before the metrics exist.",
      "We invest in founders who understand a problem from the inside.",
      "Canadian companies must be global from the first customer; the home market is not enough.",
    ],
    appetite: { saas: 0.8, ai: 0.7, devtools: 0.7, marketplace: 0.6, fintech: 0.6 },
    knownFor: ["Canadian pre-seed", "Founder-first"],
  },

  // ------------------------------------------------------------------- Europe
  {
    id: "index",
    name: "Index Ventures",
    hqHubId: "london",
    style: "consensus",
    checkSize: [1_000_000, 60_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "Great companies come from everywhere; we have backed them from Stockholm to São Paulo.",
      "Founder-first, and specific: we index on the person's insight into their own market.",
      "Software eats verticals one workflow at a time. Own the workflow, not the category name.",
    ],
    appetite: { saas: 0.9, fintech: 0.8, ai: 0.8, commerce: 0.7, marketplace: 0.7, consumer: 0.6 },
    knownFor: ["European and global reach", "Vertical software depth"],
  },
  {
    id: "balderton",
    name: "Balderton Capital",
    hqHubId: "london",
    thesis: [
      "Europe builds category leaders now; they no longer have to move to build them.",
      "We lead early rounds and stay concentrated rather than spraying capital.",
      "Sustainable unit economics from the start, because European capital is less forgiving.",
    ],
    appetite: { saas: 0.9, fintech: 0.8, ai: 0.7, marketplace: 0.6, healthcare: 0.5, crypto: 0.1 },
    knownFor: ["European Series A leadership", "Concentrated portfolios"],
  },
  {
    id: "atomico",
    name: "Atomico",
    hqHubId: "london",
    thesis: [
      "Built by founders, for founders: we have operated the thing we are underwriting.",
      "European technology is systematically underestimated and therefore underpriced.",
      "We publish the State of European Tech because the data did not exist until we made it.",
    ],
    appetite: { saas: 0.8, ai: 0.8, energy: 0.7, fintech: 0.7, healthcare: 0.6, consumer: 0.5 },
    knownFor: ["State of European Tech", "Operator-led"],
  },
  {
    id: "partech",
    name: "Partech",
    hqHubId: "paris",
    thesis: [
      "We invest across three continents from one partnership, and the pattern-matching travels.",
      "Enterprise software and fintech in markets institutional capital has not reached yet.",
      "African and European founders are building for markets US investors do not understand.",
    ],
    appetite: { fintech: 0.9, saas: 0.8, ai: 0.7, commerce: 0.6, logistics: 0.6, healthcare: 0.5 },
    knownFor: ["Cross-continental funds", "Africa practice"],
  },
  {
    id: "cherry",
    name: "Cherry Ventures",
    hqHubId: "berlin",
    checkSize: [500_000, 10_000_000],
    stages: ["pre-seed", "seed"],
    thesis: [
      "Pre-seed and seed in Europe, led by people who have operated rather than only allocated.",
      "Germany and the Nordics produce disciplined companies; we back that discipline early.",
      "Capital efficiency is a feature, not a constraint imposed by a thin market.",
    ],
    appetite: { saas: 0.8, commerce: 0.7, logistics: 0.7, fintech: 0.7, ai: 0.7, healthcare: 0.5 },
    knownFor: ["European pre-seed", "Operator partnership"],
  },
  {
    id: "creandum",
    name: "Creandum",
    hqHubId: "stockholm",
    thesis: [
      "Nordic companies are global from their second market because the first one is small.",
      "We back product-led companies where the product does the selling.",
      "Design and craft are commercial advantages, not decoration.",
    ],
    appetite: { consumer: 0.8, saas: 0.8, fintech: 0.8, ai: 0.7, marketplace: 0.6, media: 0.6 },
    knownFor: ["Nordic early stage", "Product-led growth"],
  },

  // ------------------------------------------------------------------ Israel
  {
    id: "aleph",
    name: "Aleph",
    hqHubId: "telaviv",
    checkSize: [1_000_000, 20_000_000],
    thesis: [
      "We back Israeli founders building global category leaders, and only a handful at a time.",
      "The constraint on Israeli companies is never engineering; it is go-to-market in America.",
      "We would rather be deeply involved in ten companies than lightly involved in fifty.",
    ],
    appetite: { saas: 0.9, ai: 0.8, fintech: 0.7, devtools: 0.7, commerce: 0.6, healthcare: 0.5 },
    knownFor: ["Small concentrated portfolio", "US go-to-market support"],
  },

  // ---------------------------------------------------------------- Asia-Pac
  {
    id: "peakxv",
    name: "Peak XV Partners",
    hqHubId: "bangalore",
    style: "conviction",
    checkSize: [1_000_000, 80_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "India and South-East Asia are not a discount market; they are a different market.",
      "Price sensitivity is a design constraint that produces better products, not a ceiling.",
      "We back companies serving the next half-billion internet users as a first market.",
    ],
    appetite: { fintech: 0.9, saas: 0.8, commerce: 0.8, ai: 0.7, education: 0.6, logistics: 0.6 },
    knownFor: ["India and SEA scale", "Surge accelerator"],
  },
  {
    id: "jungle",
    name: "Jungle Ventures",
    hqHubId: "singapore",
    thesis: [
      "South-East Asia is a dozen markets pretending to be one; localisation is the whole job.",
      "We build regional champions rather than importing western playbooks.",
      "Capital discipline matters more here because the exit window is narrower.",
    ],
    appetite: { commerce: 0.8, fintech: 0.8, saas: 0.7, logistics: 0.7, ai: 0.6, healthcare: 0.5 },
    knownFor: ["SEA regional champions", "Localisation focus"],
  },
  {
    id: "globalbrain",
    name: "Global Brain",
    hqHubId: "tokyo",
    style: "consensus",
    thesis: [
      "Japanese enterprises adopt slowly and then never leave. Earn the first one properly.",
      "We bridge foreign startups into Japanese corporates, which is the actual bottleneck.",
      "Trust compounds here in a way that growth-at-all-costs cannot buy.",
    ],
    appetite: { saas: 0.8, ai: 0.7, manufacturing: 0.7, logistics: 0.6, healthcare: 0.6, consumer: 0.5 },
    knownFor: ["Corporate venture bridge", "Japan market entry"],
  },
  {
    id: "altos",
    name: "Altos Ventures",
    hqHubId: "seoul",
    style: "metrics-first",
    thesis: [
      "We back companies that can become profitable, not companies that can raise again.",
      "Korean and Korean-American founders building for global markets from a dense home base.",
      "Capital efficiency is the strategy, not the fallback.",
    ],
    appetite: { consumer: 0.8, fintech: 0.8, commerce: 0.7, saas: 0.7, ai: 0.6, media: 0.6 },
    knownFor: ["Profitability focus", "Korea and diaspora"],
  },
  {
    id: "blackbird",
    name: "Blackbird Ventures",
    hqHubId: "sydney",
    style: "conviction",
    thesis: [
      "Australia and New Zealand produce globally ambitious companies from a small home market.",
      "We back the most ambitious version of the plan and hold for twenty years.",
      "Distance from Silicon Valley is an advantage: you are forced to build something people pay for.",
    ],
    appetite: { saas: 0.9, ai: 0.7, healthcare: 0.6, energy: 0.6, consumer: 0.6, hardware: 0.5 },
    knownFor: ["ANZ ambition", "Very long holds"],
  },

  // ------------------------------------------------------- Middle East, LatAm, Africa
  {
    id: "beco",
    name: "BECO Capital",
    hqHubId: "dubai",
    thesis: [
      "The Gulf has concentrated buying power and almost no local software supply.",
      "Regional regulation is a moat for whoever navigates it first.",
      "We back companies serving MENA as a first market, not as an expansion slide.",
    ],
    appetite: { fintech: 0.9, logistics: 0.8, commerce: 0.7, saas: 0.7, healthcare: 0.6, government: 0.6 },
    knownFor: ["MENA early stage", "Regional regulatory navigation"],
  },
  {
    id: "kaszek",
    name: "Kaszek",
    hqHubId: "saopaulo",
    style: "conviction",
    checkSize: [1_000_000, 50_000_000],
    stages: ["seed", "series-a", "series-b", "growth"],
    thesis: [
      "Latin America's incumbents are slow, concentrated and deeply disliked. That is the opportunity.",
      "We back founders who have lived the problem in the region, not observers of it.",
      "Fintech first, because financial exclusion is the region's defining constraint.",
    ],
    appetite: { fintech: 0.9, commerce: 0.8, logistics: 0.7, saas: 0.7, healthcare: 0.6, education: 0.6 },
    knownFor: ["LatAm category leaders", "Founder-operator bias"],
  },
  {
    id: "tlcom",
    name: "TLcom Capital",
    hqHubId: "lagos",
    thesis: [
      "African markets are solved by companies built inside them, not adapted into them.",
      "Infrastructure gaps are the product opportunity and the operating constraint at once.",
      "We underwrite to cash generation because follow-on capital cannot be assumed here.",
    ],
    appetite: { fintech: 0.9, logistics: 0.8, commerce: 0.7, healthcare: 0.7, education: 0.6, energy: 0.6 },
    knownFor: ["Sub-Saharan Africa focus", "Cash-generative underwriting"],
  },
];

export const FIRMS: Record<string, Firm> = Object.fromEntries(
  DRAFTS.map((d) => [d.id, firm(d)])
);

export const FIRM_LIST = Object.values(FIRMS);

/** Firms headquartered in a given hub. */
export function firmsInHub(hubId: string): Firm[] {
  return FIRM_LIST.filter((f) => f.hqHubId === hubId);
}
