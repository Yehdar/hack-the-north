// ============================================================================
// SHARED CONTRACT — frozen at the 1.5h sync point.
//
// Track A (Discovery) writes: extractedProblems, chosenProblem, hubFindings, pvs
// Track B (Defense)   writes: pitchTranscript, objections, verdict
//
// Neither track edits the other's fields or reformats this file outside a
// sync point. When the two halves disagree at integration, THIS FILE IS THE
// ARBITER — whoever drifted from it is the one who changes.
// ============================================================================

export type HubId = string;
export type AgentId = string;
export type SeatId = "gp" | "principal" | "skeptic";

// ---------------------------------------------------------------------------
// Shared primitive: every agent in the system, hub or VC, returns this shape.
// ---------------------------------------------------------------------------

export type AgentVerdict = {
  agentId: AgentId;
  /** -1 = hard no, 0 = neutral, +1 = strong yes */
  stance: number;
  /** 0..1, self-reported. Low confidence de-weights a heavy seat. */
  confidence: number;
  /** One line, headline-length. Rendered in the panel list. */
  position: string;
  reasoning: string;
  /** References into seed data, e.g. "firm.antiPortfolio[0]". Unbound claims
   *  render as speculative in the UI and lower PVS evidence strength. */
  evidence: string[];
  whatWouldChangeMyMind: string;
};

export type AgentTemplate = {
  id: AgentId;
  family: "hub" | "vc" | "cross";
  role: string;
  /** Pre-normalization. Runtime normalizes across whichever agents are active. */
  defaultWeight: number;
  persona: {
    name: string;
    background: string;
    /** ElevenLabs voice id. VC seats only. */
    voiceId?: string;
  };
  /** Hard convictions, stated as beliefs in the system prompt. This is the
   *  single lever that stops N agents collapsing into one opinion. */
  priors: string[];
  /** What this agent is allowed to judge. Keeps lanes distinct. */
  focus: string[];
  temperature: number;
};

// ---------------------------------------------------------------------------
// DISCOVERY — Track A writes, Track B reads only
// ---------------------------------------------------------------------------

export type ProblemStatement = {
  id: string;
  statement: string;
  whoHasIt: string;
  /** 0..100 */
  severity: number;
  frequency: string;
  currentWorkaround: string;
  willingnessToPay: string;
  evidence: string[];
  /** 0..1 */
  confidence: number;
};

export type HubFinding = {
  hubId: HubId;
  /** 0..100, drives hub card colour */
  fitScore: number;
  verdicts: AgentVerdict[];
  gapSummary: string;
  incumbents: { company: string; solves: string; weakness: string }[];
  unserved: string;
};

export type PVSBreakdown = {
  /** 0..100 */
  total: number;
  problemSeverity: number;
  marketGap: number;
  hubFit: number;
  evidenceStrength: number;
  /** Soft gate. Below this the founder is warned but may still pitch. */
  threshold: number;
  passed: boolean;
  /** Points taken off the weighted total, and why, in plain words. */
  penalties?: { reason: string; points: number }[];
};

// ---------------------------------------------------------------------------
// DEFENSE — Track B writes, Track A reads only
// ---------------------------------------------------------------------------

export type TranscriptTurn = {
  turn: number;
  speaker: "founder" | SeatId;
  text: string;
  /** epoch ms */
  at: number;
};

export type ObjectionType =
  | "unsupported-claim"
  | "dodged"
  | "competitor"
  | "unit-economics"
  | "timing";

export type Objection = {
  id: string;
  seatId: SeatId;
  text: string;
  type: ObjectionType;
  status: "open" | "answered" | "dodged";
  raisedAtTurn: number;
  resolvedAtTurn?: number;
};

export type ICVerdict = {
  decision: "invest" | "conditional" | "pass";
  /** Weighted, confidence-adjusted, objection-penalized. -1..1 */
  score: number;
  seatVotes: AgentVerdict[];
  conditions: string[];
  comeBackWhen: string;
  /** The single objection that sank it, if any. */
  killShot?: string;
  /** agentIds whose stance diverged sharply from consensus. Never averaged away. */
  dissents: AgentId[];
};

// ---------------------------------------------------------------------------
// THE SPINE
// ---------------------------------------------------------------------------

export type VentureFile = {
  id: string;
  /** Bump on any mutation. Agent output cache keys include this. */
  version: number;
  /** The founder's own words. The only required input. */
  solution: string;

  // Track A
  extractedProblems: ProblemStatement[];
  chosenProblem?: ProblemStatement;
  hubFindings: Record<HubId, HubFinding>;
  pvs?: PVSBreakdown;

  // Track B
  pitchTranscript: TranscriptTurn[];
  objections: Objection[];
  verdict?: ICVerdict;
};

// ---------------------------------------------------------------------------
// Seed data shapes
// ---------------------------------------------------------------------------

export type Stage = "pre-seed" | "seed" | "series-a" | "series-b" | "growth";

export type Firm = {
  id: string;
  name: string;
  hqHubId: HubId;
  /** Public, quotable positions. Agents cite these as firm.thesis[n]. */
  thesis: string[];
  stages: Stage[];
  /** USD */
  checkSize: [number, number];
  sectorAppetite: Record<string, number>; // -1 aversion .. +1 love
  knownFor: string[];
  /** Fuel for the Skeptic seat. */
  antiPortfolio: { company: string; whyPassed: string; outcome: string }[];
  decisionStyle: "conviction" | "consensus" | "thesis-driven" | "metrics-first";
};
