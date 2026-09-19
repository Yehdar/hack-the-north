import type { HubId } from "@/lib/types";
import type { Industry, Persona } from "@/lib/discovery/types";
import raw from "./library.json";

// ============================================================================
// PERSONA LIBRARY + RETRIEVAL
//
// The obvious approach is a reranking model to pick which personas see an idea.
// We use attribute and keyword scoring instead — deliberately.
//
// For 300 personas, embedding retrieval buys very little: the signal that
// actually matters is "does this person work in the affected industry and can
// they sign for it", both of which are structured fields we already have.
// Attribute scoring is also explainable (we can show WHY a persona was picked),
// costs nothing, needs no extra vendor, and works with no API key at all —
// which matters because everything else in this app does too.
// ============================================================================

export const PERSONAS = raw as Persona[];

/** Keyword → industry. Deliberately overlapping: a payments tool for hospitals
 *  should surface both fintech and healthcare people, not force a single
 *  bucket the way a one-winner classifier would. */
const INDUSTRY_HINTS: Record<Industry, string[]> = {
  software: ["code", "repo", "engineer", "developer", "api", "deploy", "test", "ci", "devops", "sdk", "software", "app", "platform", "infrastructure", "observability", "bug"],
  fintech: ["payment", "invoice", "bank", "ledger", "fraud", "lending", "credit", "treasury", "accounting", "compliance", "kyc", "financial", "reconcil"],
  healthcare: ["patient", "clinic", "hospital", "health", "medical", "ehr", "care", "diagnos", "pharma", "therap"],
  commerce: ["shop", "retail", "ecommerce", "marketplace", "cart", "merchandis", "inventory", "storefront", "seller", "buyer"],
  manufacturing: ["factory", "plant", "assembly", "machine", "production line", "quality control", "industrial", "hardware", "supply chain"],
  education: ["student", "school", "course", "learn", "teacher", "curriculum", "university", "tutor", "classroom", "grading"],
  logistics: ["shipping", "delivery", "fleet", "warehouse", "freight", "route", "dispatch", "last mile", "logistics"],
  media: ["content", "video", "audience", "publish", "newsroom", "streaming", "creator", "advertis", "podcast"],
  energy: ["grid", "energy", "solar", "carbon", "emission", "utility", "power", "renewable", "sustainab"],
  government: ["citizen", "public sector", "municipal", "government", "permit", "civic", "procurement", "regulat"],
};

export type RetrievalHit = {
  persona: Persona;
  score: number;
  /** Why this persona was selected. Shown in the UI — retrieval a founder
   *  cannot interrogate is retrieval they have no reason to trust. */
  why: string[];
};

/** Industries the idea touches, strongest first. */
export function inferIndustries(idea: string): { industry: Industry; hits: number }[] {
  const text = idea.toLowerCase();
  return (Object.keys(INDUSTRY_HINTS) as Industry[])
    .map((industry) => ({
      industry,
      hits: INDUSTRY_HINTS[industry].filter((k) => text.includes(k)).length,
    }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Who should see this idea.
 *
 * Industry match dominates, then the ability to actually buy. A crowd of
 * enthusiastic people who cannot sign a cheque produces a warm, useless result
 * — which is the failure mode of every "we surveyed our users" deck.
 */
export function selectRelevant(
  idea: string,
  opts: { limit?: number; hubId?: HubId } = {}
): RetrievalHit[] {
  const limit = opts.limit ?? 120;
  const industries = inferIndustries(idea);
  const top = new Map(industries.slice(0, 3).map((r, i) => [r.industry, 3 - i]));
  const novel = /\bai\b|agent|autonomous|llm|generative|novel|first/.test(idea.toLowerCase());

  const pool = opts.hubId ? PERSONAS.filter((p) => p.hubId === opts.hubId) : PERSONAS;

  const scored = pool.map((persona) => {
    const why: string[] = [];
    let score = 0;

    const industryWeight = top.get(persona.professional.industry);
    if (industryWeight) {
      score += industryWeight * 4;
      why.push(`works in ${persona.professional.industry}`);
    }

    // Can they sign?
    const authority = persona.psychographics.budgetAuthority;
    score += authority * 0.6;
    if (authority >= 7) why.push("holds budget");

    // Low pain tolerance means they actually feel problems rather than
    // absorbing them silently — the people worth asking.
    score += (10 - persona.psychographics.painTolerance) * 0.35;
    if (persona.psychographics.painTolerance <= 3) why.push("low tolerance for friction");

    // Novel ideas need early adopters to get a fair hearing; a laggard
    // dismissing something unfamiliar is not market signal.
    if (novel) {
      score += persona.psychographics.techAdoption * 0.4;
      if (persona.psychographics.techAdoption >= 8) why.push("early adopter");
    }

    // A little influence weighting — loud people shape markets.
    score += persona.psychographics.influenceScore * 0.2;

    return { persona, score, why };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function personasByHub(): Record<HubId, Persona[]> {
  const out: Record<string, Persona[]> = {};
  for (const p of PERSONAS) (out[p.hubId] ??= []).push(p);
  return out;
}

export function getPersona(id: number): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
