import { getLLM } from "@/lib/llm";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// PROBLEM SPLIT — beat ② of Part 1.
//
// The founder describes a SOLUTION. This enumerates the distinct problems it
// could be solving, and the ordering carries meaning:
//
//   index 0 = the problem the founder plainly believes they are solving
//   the rest = genuinely different problems the same solution would also serve
//
// Index 0 being the pitched framing is load-bearing. The crowd later votes on
// these, and if the winner is not index 0 we have the reveal: you built this
// for problem A, the market that responded has problem C. `ventureFileToContext`
// in src/lib/agents/vc/context.ts already reads extractedProblems[0] as the
// founder's original framing, so Part 2 inherits this for free.
// ============================================================================

const SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string", description: "The problem, as the person who has it would say it" },
          whoHasIt: { type: "string", description: "The specific role or group, not 'businesses'" },
          severity: { type: "number", description: "0-100, how badly it hurts" },
          frequency: { type: "string" },
          currentWorkaround: { type: "string", description: "What they do about it today" },
          willingnessToPay: { type: "string" },
          confidence: { type: "number", description: "0-1" },
        },
        required: ["statement", "whoHasIt", "severity", "frequency", "currentWorkaround", "willingnessToPay", "confidence"],
      },
    },
  },
  required: ["problems"],
} as const;

const SYSTEM = `You analyse startup ideas for a living and you have seen a great many founders build the right thing for the wrong reason.

A founder will describe what they BUILT. Your job is to enumerate the distinct problems that thing could be solving.

Rules that matter:

- The FIRST problem you return must be the one this founder plainly believes
  they are solving. Read it off their own framing, uncritically.
- Every problem after that must be GENUINELY DIFFERENT — a different person
  feeling a different pain, not the same problem reworded at a different
  altitude. If you cannot find a different one, return fewer.
- The most valuable entry is usually an adjacent problem that is more acute
  than the one the founder led with, felt by someone they have not thought
  about. Look hard for it.
- "whoHasIt" names a role, not a category. "Staff engineers accountable for
  incidents" is useful. "Businesses" is not.
- Severity is how much it hurts the person who has it, not how interesting the
  market is.`;

export async function extractProblems(solution: string): Promise<ProblemStatement[]> {
  const res = await getLLM().completeJSON<{
    problems: Omit<ProblemStatement, "id" | "evidence">[];
  }>({
    system: SYSTEM,
    user: `The founder says they built:

"${solution}"

Return four or five problems this could be solving. First one is their own framing.`,
    schema: { name: "problem_split", schema: SCHEMA as unknown as Record<string, unknown> },
    temperature: 0.8,
    maxTokens: 1400,
    tier: "deep",
  });

  return (res.problems ?? []).slice(0, 5).map((p, i) => ({
    id: `p${i + 1}`,
    statement: p.statement?.trim() || "Unstated problem.",
    whoHasIt: p.whoHasIt?.trim() || "Unspecified.",
    severity: clamp(Number(p.severity) || 0, 0, 100),
    frequency: p.frequency?.trim() || "Unknown",
    currentWorkaround: p.currentWorkaround?.trim() || "Unknown",
    willingnessToPay: p.willingnessToPay?.trim() || "Unknown",
    evidence: [],
    confidence: clamp(Number(p.confidence) || 0.5, 0, 1),
  }));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
