import { getLLM } from "@/lib/llm";
import type { ProblemStatement } from "@/lib/types";

// ============================================================================
// THE REFINE LOOP — rewrite the pitch around the problem the market has.
//
// The rewrite changes the framing, never the product. If it invented features
// the second run would be testing a different product, and the comparison
// between the two runs — the reason this loop exists — would mean nothing.
// ============================================================================

const SCHEMA = {
  type: "object",
  properties: {
    solution: {
      type: "string",
      description: "The rewritten description, one or two sentences, in the founder's voice",
    },
  },
  required: ["solution"],
} as const;

const SYSTEM = `You rewrite a founder's one-line product description so it leads with the problem their market actually has.

Rules:
- Same product. Keep what it does exactly as the founder described it. Do not
  add features, integrations or claims that are not in the original.
- Name who has the problem, specifically, the way the research names them.
- One or two plain sentences, in the founder's voice. No hype words.`;

export async function refinePitch(
  solution: string,
  problem: ProblemStatement
): Promise<string> {
  const res = await getLLM()
    .completeJSON<{ solution?: string }>({
      system: SYSTEM,
      user: `THE FOUNDER'S DESCRIPTION:
"${solution}"

THE PROBLEM THE MARKET ACTUALLY HAS:
"${problem.statement}"
  Felt by: ${problem.whoHasIt}
  Today they cope by: ${problem.currentWorkaround}

Rewrite the description so it leads with that problem.`,
      schema: { name: "refined_pitch", schema: SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.6,
      maxTokens: 400,
      tier: "fast",
    })
    .catch(() => ({ solution: "" }));

  const rewritten = res.solution?.trim();
  if (rewritten && rewritten.length > 12) return rewritten;

  // A founder staring at an empty box is worse than a plain template they can edit.
  return `${solution.trim().replace(/[.!\s]+$/, "")}, for ${lowerFirst(
    problem.whoHasIt.replace(/\.$/, "")
  )}: ${lowerFirst(problem.statement)}`;
}

function lowerFirst(t: string): string {
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}
