import type { HubId } from "@/lib/types";

// ============================================================================
// DISCOVERY TYPES — Part 1.
//
// The crowd is what gives the globe density and the market its spread. These
// personas are procedurally generated and committed, not authored by hand and
// not invented per run, so every run scores the same population and two runs
// of the same idea are comparable.
// ============================================================================

export type Seniority = "IC" | "Senior" | "Lead" | "Director" | "Exec";

export type Industry =
  | "software"
  | "fintech"
  | "healthcare"
  | "commerce"
  | "manufacturing"
  | "education"
  | "logistics"
  | "media"
  | "energy"
  | "government";

/** How a person is drawn on the globe. Chosen explicitly when the library is
 *  generated — never inferred from a name. */
export type FigureKind = "girl" | "boy";

export type Persona = {
  id: number;
  name: string;
  figure: FigureKind;
  title: string;
  hubId: HubId;
  location: { city: string; country: string; lat: number; lon: number };
  demographics: { generation: string; ageRange: string };
  professional: {
    seniority: Seniority;
    industry: Industry;
    companySize: string;
    yearsExperience: number;
  };
  /**
   * 1..10. These are what actually make two personas react differently —
   * without them, 300 personas are one persona with 300 names.
   *
   * budgetAuthority and painTolerance are ours, and they earn their place:
   * budgetAuthority separates someone who loves it from someone who can sign
   * for it, and painTolerance separates a real problem from a mild annoyance.
   * Both feed the validation score directly.
   */
  psychographics: {
    techAdoption: number;
    riskTolerance: number;
    priceSensitivity: number;
    influenceScore: number;
    brandLoyalty: number;
    budgetAuthority: number;
    painTolerance: number;
  };
  interests: string[];
};

export type Attention = "full" | "partial" | "ignore";

export type CrowdReaction = {
  personaId: number;
  attention: Attention;
  /** 0 hostile .. 1 enthusiastic */
  sentiment: number;
  /**
   * THE differentiator. The usual approach asks a crowd "do you like this?"
   * and averages the answer. We ask "which of these problems do you actually
   * have?" — so the aggregate can tell a founder they pitched problem A while
   * the market that responded has problem C.
   *
   * null means: none of these are my problem.
   */
  problemId: string | null;
  /** 0..100, for the problem this persona actually picked. */
  problemSeverity: number;
  wouldPay: boolean;
  reason: string;
};

/** What the crowd concluded, once everyone has spoken. */
export type CrowdVerdict = {
  reactions: CrowdReaction[];
  /** Votes per candidate problem, highest first. */
  problemVotes: { problemId: string; votes: number; meanSeverity: number; payRate: number }[];
  /** The problem the market actually has. */
  marketProblemId: string | null;
  /** What the founder led with. */
  pitchedProblemId: string | null;
  /** True when those differ — the reveal. */
  mismatch: boolean;
  attention: Record<Attention, number>;
  meanSentiment: number;
  /** Spread of sentiment. Near zero means the crowd collapsed and is a bug. */
  sentimentSpread: number;
};
