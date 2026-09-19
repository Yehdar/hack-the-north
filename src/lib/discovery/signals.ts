import { PERSONAS } from "@/data/personas";
import type { CrowdReaction, Persona } from "./types";

// ============================================================================
// WHAT THE CROWD IS ACTUALLY TELLING YOU — pure, no model call.
//
// A list of positive and negative quotes is easy and nearly useless: a founder
// reads the nice ones and discounts the rest. What is actually actionable is
// WHO responded, expressed as the attributes that separate the people who
// engaged from the people who did not.
//
// "Your enthusiasts have a mean budget authority of 2.9 against 4.5 overall"
// tells a founder something they can act on — their fans cannot buy. No amount
// of reading quotes surfaces that.
// ============================================================================

const ATTRIBUTES = [
  "techAdoption",
  "riskTolerance",
  "priceSensitivity",
  "influenceScore",
  "brandLoyalty",
  "budgetAuthority",
  "painTolerance",
] as const;

type Attribute = (typeof ATTRIBUTES)[number];

const PLAIN: Record<Attribute, { high: string; low: string }> = {
  techAdoption: { high: "try new tools early", low: "wait for proof before adopting" },
  riskTolerance: { high: "will pilot something unproven", low: "avoid unproven tools" },
  priceSensitivity: { high: "balk at cost", low: "are not price-driven" },
  influenceScore: { high: "shape what their teams adopt", low: "have little sway" },
  brandLoyalty: { high: "prefer incumbents", low: "are open to challengers" },
  budgetAuthority: { high: "can sign for it", low: "cannot buy anything themselves" },
  painTolerance: { high: "absorb friction quietly", low: "feel every paper cut" },
};

export type Signal = {
  attribute: Attribute;
  engagedMean: number;
  ignoredMean: number;
  /** Positive = engaged score higher on this attribute. */
  delta: number;
  /** Plain sentence a founder can act on. */
  reading: string;
};

export type CrowdSignals = {
  engaged: number;
  ignored: number;
  /** Strongest separators first. Only ones that actually separate. */
  signals: Signal[];
  /** Verbatim, highest and lowest sentiment, with who said them. */
  positives: { name: string; title: string; quote: string }[];
  negatives: { name: string; title: string; quote: string }[];
  /** The single most important warning, when one applies. */
  warning: string | null;
};

export function analyseSignals(reactions: CrowdReaction[]): CrowdSignals {
  const byId = new Map(PERSONAS.map((p) => [p.id, p]));
  const withPersona = reactions
    .map((r) => ({ r, p: byId.get(r.personaId) }))
    .filter((x): x is { r: CrowdReaction; p: Persona } => Boolean(x.p));

  // Engaged against EVERYONE ELSE, not against the ignorers alone. Retrieval
  // already selected for relevance, so the pure-ignore group is often tiny and
  // conditioning on it throws away the contrast entirely.
  const engaged = withPersona.filter((x) => x.r.attention === "full");
  const ignored = withPersona.filter((x) => x.r.attention !== "full");

  const mean = (group: typeof withPersona, a: Attribute) =>
    group.length ? group.reduce((s, x) => s + x.p.psychographics[a], 0) / group.length : 0;

  const signals: Signal[] = ATTRIBUTES.map((attribute) => {
    const engagedMean = mean(engaged, attribute);
    const ignoredMean = mean(ignored, attribute);
    const delta = engagedMean - ignoredMean;

    const high = delta > 0;
    const phrase = high ? PLAIN[attribute].high : PLAIN[attribute].low;

    return {
      attribute,
      engagedMean: +engagedMean.toFixed(1),
      ignoredMean: +ignoredMean.toFixed(1),
      delta: +delta.toFixed(2),
      reading: `The people who engaged ${phrase} — ${engagedMean.toFixed(1)} against ${ignoredMean.toFixed(1)} for everyone else.`,
    };
  })
    // Half a point of separation on a 1-10 scale is the floor for saying
    // anything; below that it is noise dressed as insight.
    .filter((s) => Math.abs(s.delta) >= 0.5 && engaged.length >= 3 && ignored.length >= 3)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const quoted = withPersona.filter((x) => x.r.reason);
  const sorted = [...quoted].sort((a, b) => b.r.sentiment - a.r.sentiment);

  const toQuote = (x: { r: CrowdReaction; p: Persona }) => ({
    name: x.p.name,
    title: x.p.title,
    quote: x.r.reason,
  });

  return {
    engaged: engaged.length,
    ignored: withPersona.filter((x) => x.r.attention === "ignore").length,
    signals,
    positives: sorted.slice(0, 3).map(toQuote),
    negatives: sorted.slice(-3).reverse().map(toQuote),
    warning: warn(engaged, withPersona),
  };
}

/**
 * The one finding worth interrupting a founder for.
 *
 * Ordered by how expensive the mistake is to discover late: building for people
 * who cannot buy is the most costly and the most common, so it is checked first.
 */
function warn(
  engaged: { r: CrowdReaction; p: Persona }[],
  all: { r: CrowdReaction; p: Persona }[]
): string | null {
  if (engaged.length < 3) return null;

  const engagedAuthority =
    engaged.reduce((s, x) => s + x.p.psychographics.budgetAuthority, 0) / engaged.length;
  const overallAuthority =
    all.reduce((s, x) => s + x.p.psychographics.budgetAuthority, 0) / all.length;

  if (engagedAuthority < overallAuthority - 0.8) {
    return `Your enthusiasts cannot buy. The people who engaged score ${engagedAuthority.toFixed(1)} on budget authority against ${overallAuthority.toFixed(1)} across the crowd — you are winning users and will have to sell to someone you have not spoken to.`;
  }

  const payers = engaged.filter((x) => x.r.wouldPay).length / engaged.length;
  if (payers < 0.3) {
    return `Interest is not demand. Only ${(payers * 100).toFixed(0)}% of the people who paid full attention would pay for it.`;
  }

  const loyal =
    engaged.reduce((s, x) => s + x.p.psychographics.brandLoyalty, 0) / engaged.length;
  if (loyal > 6.5) {
    return `The people who like this also prefer incumbents (brand loyalty ${loyal.toFixed(1)}). They will ask why their current vendor cannot just ship this.`;
  }

  return null;
}
