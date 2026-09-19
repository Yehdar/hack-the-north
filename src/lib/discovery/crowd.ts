import { getLLM } from "@/lib/llm";
import type { ProblemStatement } from "@/lib/types";
import type { Persona } from "./types";
import type { Attention, CrowdReaction, CrowdVerdict } from "./types";

// ============================================================================
// THE CROWD — beats ③ and ④ of Part 1.
//
// Batched, not one call per persona. 300 individual calls is minutes of latency
// and a rate-limit fight; 15 batched calls of 20 stream back over roughly
// twenty seconds, which is the pacing this beat actually wants — fast enough
// to feel alive, slow enough to watch happen.
//
// Each persona answers a different question from Tunnel's. Theirs asks "do you
// like this?" and averages the sentiment. Ours asks "WHICH of these problems do
// you actually have?" — so the aggregate can tell a founder that the market
// which responded has a different problem from the one they pitched. An
// architecture that only averages sentiment cannot produce that finding.
// ============================================================================

const BATCH_SIZE = 20;
const CONCURRENCY = 4;

const SCHEMA = {
  type: "object",
  properties: {
    reactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          personaId: { type: "number" },
          attention: { type: "string", enum: ["full", "partial", "ignore"] },
          sentiment: { type: "number", description: "0 hostile to 1 enthusiastic" },
          problemId: { type: "string", description: "Which listed problem you actually have, or empty if none" },
          problemSeverity: { type: "number", description: "0-100, how badly that problem hurts you" },
          wouldPay: { type: "boolean" },
          reason: { type: "string", description: "One sentence, first person" },
        },
        required: ["personaId", "attention", "sentiment", "problemId", "problemSeverity", "wouldPay", "reason"],
      },
    },
  },
  required: ["reactions"],
} as const;

const SYSTEM = `You simulate how specific working people react to a new product.

You will be given a product, a list of candidate problems, and a batch of people
with their attributes scored 1-10. Answer as each of them, independently.

What the scores mean, and you must honour them:
  techAdoption      high = tries new tools early; low = waits for proof
  riskTolerance     high = will pilot something unproven
  priceSensitivity  high = balks at cost regardless of value
  budgetAuthority   high = can actually sign; low = can only advocate
  painTolerance     high = absorbs friction silently; low = feels every paper cut
  brandLoyalty      high = prefers incumbents
  influenceScore    high = their opinion moves others

The critical question is NOT whether they like the product. It is WHICH of the
listed problems each person actually has. Someone can be enthusiastic about a
product while having a completely different problem from the one it was built
for — that is a real and common outcome, and it is the most useful thing you
can surface. Set problemId to the problem they genuinely have, which is often
not the first one listed. Leave it empty when none of them is their problem;
a person with none of these problems is a finding, not a failure.

Be harsh where the attributes call for it. A high-priceSensitivity person with
no budget authority who tolerates pain well should mostly ignore things. A
crowd where everyone is interested is a crowd that has been flattered, and it
is worthless to the founder.`;

export type CrowdProgress = {
  done: number;
  total: number;
  batch: CrowdReaction[];
};

/**
 * Runs the crowd. Streams each batch as it lands so the UI can count up and
 * recolour rather than waiting on the whole population.
 */
export async function runCrowd(
  solution: string,
  problems: ProblemStatement[],
  personas: Persona[],
  onBatch?: (p: CrowdProgress) => void
): Promise<CrowdReaction[]> {
  const batches: Persona[][] = [];
  for (let i = 0; i < personas.length; i += BATCH_SIZE) {
    batches.push(personas.slice(i, i + BATCH_SIZE));
  }

  const all: CrowdReaction[] = [];
  let done = 0;

  // Fixed-size worker pool. Firing all 15 batches at once is a rate-limit
  // error; doing them one at a time is four minutes of dead air.
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= batches.length) return;

      const batch = batches[index];
      const reactions = await reactBatch(solution, problems, batch).catch(() =>
        batch.map(neutral)
      );

      all.push(...reactions);
      done += batch.length;
      onBatch?.({ done, total: personas.length, batch: reactions });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return all;
}

async function reactBatch(
  solution: string,
  problems: ProblemStatement[],
  batch: Persona[]
): Promise<CrowdReaction[]> {
  const problemList = problems
    .map((p) => `  ${p.id}: "${p.statement}" (felt by ${p.whoHasIt})`)
    .join("\n");

  const people = batch
    .map((p) => {
      const g = p.psychographics;
      return `  id ${p.id} — ${p.title}, ${p.professional.seniority}, ${p.professional.industry}, ${p.professional.companySize} people, ${p.location.city}. tech ${g.techAdoption} risk ${g.riskTolerance} price ${g.priceSensitivity} budget ${g.budgetAuthority} pain ${g.painTolerance} brand ${g.brandLoyalty} influence ${g.influenceScore}`;
    })
    .join("\n");

  const res = await getLLM().completeJSON<{ reactions: Partial<CrowdReaction>[] }>({
    system: SYSTEM,
    user: `PRODUCT:
"${solution}"

CANDIDATE PROBLEMS:
${problemList}

PEOPLE:
${people}

Return one reaction per person, using their id.`,
    schema: { name: "crowd_reactions", schema: SCHEMA as unknown as Record<string, unknown> },
    temperature: 0.9,
    maxTokens: 2400,
    tier: "fast",
  });

  const byId = new Map((res.reactions ?? []).map((r) => [r.personaId, r]));
  const validProblems = new Set(problems.map((p) => p.id));

  return batch.map((persona) => {
    const raw = byId.get(persona.id);
    if (!raw) return neutral(persona);

    const problemId =
      raw.problemId && validProblems.has(raw.problemId) ? raw.problemId : null;

    return {
      personaId: persona.id,
      attention: (["full", "partial", "ignore"] as Attention[]).includes(raw.attention as Attention)
        ? (raw.attention as Attention)
        : "partial",
      sentiment: clamp(Number(raw.sentiment) || 0.5, 0, 1),
      problemId,
      problemSeverity: problemId ? clamp(Number(raw.problemSeverity) || 0, 0, 100) : 0,
      wouldPay: Boolean(raw.wouldPay),
      reason: raw.reason?.trim() || "",
    };
  });
}

/** A persona the model dropped. Counted as present but uninterested rather than
 *  silently removed, so the denominator stays honest. */
function neutral(persona: Persona): CrowdReaction {
  return {
    personaId: persona.id,
    attention: "ignore",
    sentiment: 0.5,
    problemId: null,
    problemSeverity: 0,
    wouldPay: false,
    reason: "",
  };
}

// --------------------------------------------------------------------------- aggregate

/**
 * What the crowd concluded. Pure — no model call, so this recomputes instantly
 * when the founder edits a problem or filters the crowd.
 */
export function aggregate(
  reactions: CrowdReaction[],
  problems: ProblemStatement[]
): CrowdVerdict {
  const votes = problems.map((p) => {
    const mine = reactions.filter((r) => r.problemId === p.id);
    const payers = mine.filter((r) => r.wouldPay).length;
    return {
      problemId: p.id,
      votes: mine.length,
      meanSeverity: mine.length
        ? mine.reduce((a, r) => a + r.problemSeverity, 0) / mine.length
        : 0,
      payRate: mine.length ? payers / mine.length : 0,
    };
  });

  // Ranked by weight of feeling, not headcount alone: a problem twelve people
  // have badly and would pay for beats one thirty people have mildly.
  const ranked = [...votes].sort(
    (a, b) =>
      b.votes * (b.meanSeverity / 100) * (0.5 + b.payRate) -
      a.votes * (a.meanSeverity / 100) * (0.5 + a.payRate)
  );

  const attention: Record<Attention, number> = { full: 0, partial: 0, ignore: 0 };
  for (const r of reactions) attention[r.attention]++;

  const sentiments = reactions.map((r) => r.sentiment);
  const mean = sentiments.length
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : 0;
  const spread = sentiments.length
    ? Math.sqrt(sentiments.reduce((a, s) => a + (s - mean) ** 2, 0) / sentiments.length)
    : 0;

  const marketProblemId = ranked[0]?.votes ? ranked[0].problemId : null;
  const pitchedProblemId = problems[0]?.id ?? null;

  return {
    reactions,
    problemVotes: ranked,
    marketProblemId,
    pitchedProblemId,
    mismatch: Boolean(marketProblemId && pitchedProblemId && marketProblemId !== pitchedProblemId),
    attention,
    meanSentiment: mean,
    sentimentSpread: spread,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
