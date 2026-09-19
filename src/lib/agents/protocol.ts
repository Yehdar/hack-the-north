import { getLLM, type LLMProvider } from "@/lib/llm";
import type { AgentId, AgentTemplate, AgentVerdict } from "@/lib/types";

// ============================================================================
// DELIBERATION PROTOCOL — shared by both councils (VC seats and hub agents).
//
// The point of this file, stated plainly, is that running N agents in parallel
// and averaging their scores is not multi-agent collaboration. It is N
// single-agent calls with a mean at the end. Agents never learn anything from
// each other, so the "committee" cannot produce a conclusion that no single
// member held.
//
// This protocol makes the collaboration real and, more importantly, MEASURABLE:
//
//   Round 0  DECOMPOSE      a router splits the venture into diligence tasks
//                           and assigns each to the agent whose lane owns it
//   Round 1  INDEPENDENT    agents work only their tasks, blind to each other,
//                           so nobody anchors on anybody
//   Round 2  CROSS-EXAMINE  agents read each other's findings and issue
//                           DIRECTED challenges to specific agents
//   Round 3  REBUT          challenged agents answer and may revise stance —
//                           belief revision is recorded, not just allowed
//   Round 4  ADVERSARIAL    the Devil's Advocate attacks wherever the room
//                           has settled
//
// Everything is logged: who challenged whom, about what, and whose mind moved
// as a result. That log is the artifact — it is what distinguishes a committee
// that deliberated from a poll that was averaged.
// ============================================================================

export type DiligenceTask = {
  id: string;
  question: string;
  assignedTo: AgentId;
  why: string;
};

export type MessageKind = "finding" | "challenge" | "rebuttal" | "concession";

export type AgentMessage = {
  id: string;
  round: number;
  from: AgentId;
  /** A specific agent, or the whole room. Directedness is the point. */
  to: AgentId | "room";
  kind: MessageKind;
  text: string;
  inReplyTo?: string;
};

export type RoundRecord = {
  round: number;
  name: string;
  verdicts: AgentVerdict[];
  variance: number;
};

export type MindChange = {
  agentId: AgentId;
  from: number;
  to: number;
  delta: number;
  conceded: boolean;
};

export type DeliberationResult = {
  tasks: DiligenceTask[];
  messages: AgentMessage[];
  rounds: RoundRecord[];
  finalVerdicts: AgentVerdict[];
  metrics: {
    varianceByRound: number[];
    challenges: number;
    rebuttals: number;
    concessions: number;
    mindChanges: MindChange[];
    /** Positive = the room converged. Negative = deliberation pulled it apart,
     *  which is a legitimate and more interesting outcome. */
    convergence: number;
    durationMs: number;
  };
};

export type DeliberationEvent =
  | { type: "task"; task: DiligenceTask }
  | { type: "message"; message: AgentMessage }
  | { type: "verdict"; verdict: AgentVerdict; round: number }
  | { type: "round"; record: RoundRecord };

export type DeliberateOptions = {
  agents: AgentTemplate[];
  /** The Devil's Advocate, run last against whatever the room settled on. */
  adversary?: AgentTemplate;
  /** Serialized VentureFile or hub context. */
  context: string;
  buildSystemPrompt: (agent: AgentTemplate) => string;
  llm?: LLMProvider;
  /** Streams progress so the UI never shows dead air. */
  onEvent?: (e: DeliberationEvent) => void;
  /** Skip cross-examination and rebuttal. Faster, and strictly worse. */
  quick?: boolean;
};

// --------------------------------------------------------------------------- schemas

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    stance: { type: "number", description: "-1 hard no to +1 strong yes" },
    confidence: { type: "number", description: "0 to 1" },
    position: { type: "string", description: "One line, headline length" },
    reasoning: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    whatWouldChangeMyMind: { type: "string" },
  },
  required: ["stance", "confidence", "position", "reasoning", "evidence", "whatWouldChangeMyMind"],
} as const;

const TASKS_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          assignedTo: { type: "string" },
          why: { type: "string" },
        },
        required: ["question", "assignedTo", "why"],
      },
    },
  },
  required: ["tasks"],
} as const;

const CHALLENGES_SCHEMA = {
  type: "object",
  properties: {
    challenges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          to: { type: "string", description: "The agent id you are challenging" },
          text: { type: "string" },
        },
        required: ["to", "text"],
      },
    },
  },
  required: ["challenges"],
} as const;

const REBUTTAL_SCHEMA = {
  type: "object",
  properties: {
    response: { type: "string" },
    conceded: { type: "boolean", description: "True if the challenge actually moved you" },
    revisedStance: { type: "number" },
    revisedConfidence: { type: "number" },
  },
  required: ["response", "conceded", "revisedStance", "revisedConfidence"],
} as const;

// --------------------------------------------------------------------------- engine

export async function deliberate(
  opts: DeliberateOptions
): Promise<DeliberationResult> {
  const started = Date.now();
  const llm = opts.llm ?? getLLM();
  const emit = opts.onEvent ?? (() => {});

  const messages: AgentMessage[] = [];
  const rounds: RoundRecord[] = [];
  let seq = 0;
  const nextId = () => `m${++seq}`;

  // ---- Round 0: decompose -------------------------------------------------
  const tasks = await decompose(opts, llm);
  for (const t of tasks) emit({ type: "task", task: t });

  // ---- Round 1: independent, blind ---------------------------------------
  let verdicts = await Promise.all(
    opts.agents.map(async (agent) => {
      const mine = tasks.filter((t) => t.assignedTo === agent.id);
      const v = await independentPass(agent, mine, opts, llm);
      emit({ type: "verdict", verdict: v, round: 1 });

      const msg: AgentMessage = {
        id: nextId(),
        round: 1,
        from: agent.id,
        to: "room",
        kind: "finding",
        text: v.position,
      };
      messages.push(msg);
      emit({ type: "message", message: msg });
      return v;
    })
  );
  rounds.push(record(1, "independent", verdicts));
  emit({ type: "round", record: rounds[0] });

  if (!opts.quick) {
    // ---- Round 2: cross-examination --------------------------------------
    const challengeLists = await Promise.all(
      opts.agents.map((agent) =>
        crossExamine(agent, verdicts, opts, llm).catch(() => [])
      )
    );

    const challenges: AgentMessage[] = [];
    challengeLists.flat().forEach((c) => {
      // Drop self-challenges and challenges to agents not in the room.
      if (c.to === c.from || !opts.agents.some((a) => a.id === c.to)) return;
      const msg: AgentMessage = { ...c, id: nextId(), round: 2, kind: "challenge" };
      challenges.push(msg);
      messages.push(msg);
      emit({ type: "message", message: msg });
    });

    // ---- Round 3: rebuttal and belief revision ---------------------------
    verdicts = await Promise.all(
      verdicts.map(async (v) => {
        const against = challenges.filter((c) => c.to === v.agentId);
        if (against.length === 0) return v;

        const agent = opts.agents.find((a) => a.id === v.agentId)!;
        const r = await rebut(agent, v, against, opts, llm).catch(() => null);
        if (!r) return v;

        const msg: AgentMessage = {
          id: nextId(),
          round: 3,
          from: v.agentId,
          to: against[0].from,
          kind: r.conceded ? "concession" : "rebuttal",
          text: r.response,
          inReplyTo: against[0].id,
        };
        messages.push(msg);
        emit({ type: "message", message: msg });

        const revised: AgentVerdict = {
          ...v,
          stance: clamp(r.revisedStance, -1, 1),
          confidence: clamp(r.revisedConfidence, 0, 1),
        };
        emit({ type: "verdict", verdict: revised, round: 3 });
        return revised;
      })
    );
    rounds.push(record(3, "post-rebuttal", verdicts));
    emit({ type: "round", record: rounds[rounds.length - 1] });
  }

  // ---- Round 4: adversarial --------------------------------------------
  if (opts.adversary) {
    const v = await independentPass(
      opts.adversary,
      [],
      { ...opts, context: `${opts.context}\n\nWHERE THE ROOM HAS SETTLED:\n${summarize(verdicts)}` },
      llm
    ).catch(() => null);

    if (v) {
      verdicts = [...verdicts, v];
      emit({ type: "verdict", verdict: v, round: 4 });
      const msg: AgentMessage = {
        id: nextId(),
        round: 4,
        from: opts.adversary.id,
        to: "room",
        kind: "challenge",
        text: v.position,
      };
      messages.push(msg);
      emit({ type: "message", message: msg });
    }
    rounds.push(record(4, "adversarial", verdicts));
    emit({ type: "round", record: rounds[rounds.length - 1] });
  }

  // ---- Metrics ----------------------------------------------------------
  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const mindChanges = diffStances(first.verdicts, verdicts, messages);

  return {
    tasks,
    messages,
    rounds,
    finalVerdicts: verdicts,
    metrics: {
      varianceByRound: rounds.map((r) => r.variance),
      challenges: messages.filter((m) => m.kind === "challenge").length,
      rebuttals: messages.filter((m) => m.kind === "rebuttal").length,
      concessions: messages.filter((m) => m.kind === "concession").length,
      mindChanges,
      convergence: first.variance - last.variance,
      durationMs: Date.now() - started,
    },
  };
}

// --------------------------------------------------------------------------- steps

async function decompose(
  opts: DeliberateOptions,
  llm: LLMProvider
): Promise<DiligenceTask[]> {
  const roster = opts.agents
    .map((a) => `  ${a.id} — ${a.role}. Judges: ${a.focus.join(", ")}.`)
    .join("\n");

  const res = await llm
    .completeJSON<{ tasks: { question: string; assignedTo: string; why: string }[] }>({
      system: `You chair an investment committee. You hold no opinion of your own and never express one.

Your only job is to split the decision into concrete diligence questions and assign each to the one member whose lane owns it. A question assigned to the wrong lane wastes that member's turn.`,
      user: `${opts.context}

THE ROOM:
${roster}

Produce five to seven diligence questions. Each must be answerable, specific to
this venture rather than generic, and assigned to exactly one member by id.
Do not assign two members the same question.`,
      schema: { name: "diligence_tasks", schema: TASKS_SCHEMA as unknown as Record<string, unknown> },
      temperature: 0.3,
      maxTokens: 900,
      tier: "fast",
    })
    .catch(() => ({ tasks: [] }));

  const valid = (res.tasks ?? []).filter((t) =>
    opts.agents.some((a) => a.id === t.assignedTo)
  );

  // If decomposition fails entirely, fall back to each agent owning its own
  // focus areas. The room must still be able to meet.
  if (valid.length === 0) {
    return opts.agents.map((a, i) => ({
      id: `t${i + 1}`,
      question: `Assess this venture on: ${a.focus.join(", ")}.`,
      assignedTo: a.id,
      why: "Fallback assignment by declared lane.",
    }));
  }

  return valid.map((t, i) => ({ id: `t${i + 1}`, ...t }));
}

async function independentPass(
  agent: AgentTemplate,
  tasks: DiligenceTask[],
  opts: DeliberateOptions,
  llm: LLMProvider
): Promise<AgentVerdict> {
  const assigned =
    tasks.length > 0
      ? `\nThe chair assigned you these questions. Answer them and nothing else:\n${tasks
          .map((t) => `  - ${t.question}`)
          .join("\n")}`
      : "";

  const raw = await llm.completeJSON<Partial<AgentVerdict>>({
    system: opts.buildSystemPrompt(agent),
    user: `${opts.context}${assigned}

No one else has spoken yet and you cannot see what they think. Form your own
position. Cite the evidence you are relying on by field reference.`,
    schema: { name: "agent_verdict", schema: VERDICT_SCHEMA as unknown as Record<string, unknown> },
    temperature: agent.temperature,
    maxTokens: 700,
    tier: "deep",
  });

  return {
    agentId: agent.id,
    stance: clamp(Number(raw.stance) || 0, -1, 1),
    confidence: clamp(Number(raw.confidence) || 0.5, 0, 1),
    position: raw.position?.trim() || "No position stated.",
    reasoning: raw.reasoning?.trim() || "",
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    whatWouldChangeMyMind: raw.whatWouldChangeMyMind?.trim() || "",
  };
}

async function crossExamine(
  agent: AgentTemplate,
  verdicts: AgentVerdict[],
  opts: DeliberateOptions,
  llm: LLMProvider
): Promise<{ from: AgentId; to: AgentId; text: string }[]> {
  const others = verdicts.filter((v) => v.agentId !== agent.id);
  if (others.length === 0) return [];

  const res = await llm.completeJSON<{ challenges: { to: string; text: string }[] }>({
    system: opts.buildSystemPrompt(agent),
    user: `${opts.context}

The rest of the room has now stated its positions:

${others
  .map(
    (v) =>
      `  [${v.agentId}] stance ${v.stance.toFixed(2)}, confidence ${v.confidence.toFixed(2)}
    "${v.position}"
    Reasoning: ${v.reasoning}`
  )
  .join("\n\n")}

Challenge at most two of them. Address each challenge to one agent by id, and
make it specific to what that agent actually claimed — a challenge that would
apply to anybody is not worth the room's time. If a colleague is right and you
have nothing substantive to press, return no challenges rather than
manufacturing disagreement.`,
    schema: { name: "challenges", schema: CHALLENGES_SCHEMA as unknown as Record<string, unknown> },
    temperature: agent.temperature,
    maxTokens: 500,
    tier: "deep",
  });

  return (res.challenges ?? [])
    .slice(0, 2)
    .map((c) => ({ from: agent.id, to: c.to, text: c.text }));
}

async function rebut(
  agent: AgentTemplate,
  verdict: AgentVerdict,
  challenges: AgentMessage[],
  opts: DeliberateOptions,
  llm: LLMProvider
) {
  return llm.completeJSON<{
    response: string;
    conceded: boolean;
    revisedStance: number;
    revisedConfidence: number;
  }>({
    system: opts.buildSystemPrompt(agent),
    user: `${opts.context}

Your position was: "${verdict.position}" (stance ${verdict.stance.toFixed(2)}, confidence ${verdict.confidence.toFixed(2)})

You have been challenged:
${challenges.map((c) => `  [${c.from}] ${c.text}`).join("\n")}

Answer. Then restate your stance and confidence.

Conceding when a colleague is right is doing the job properly, not losing. But
do not concede to social pressure — your convictions are not up for negotiation
just because someone pushed. Move only if the argument actually moved you, and
set conceded accordingly.`,
    schema: { name: "rebuttal", schema: REBUTTAL_SCHEMA as unknown as Record<string, unknown> },
    temperature: agent.temperature,
    maxTokens: 500,
    tier: "deep",
  });
}

// --------------------------------------------------------------------------- helpers

function record(round: number, name: string, verdicts: AgentVerdict[]): RoundRecord {
  return { round, name, verdicts: verdicts.map((v) => ({ ...v })), variance: variance(verdicts) };
}

export function variance(verdicts: AgentVerdict[]): number {
  if (verdicts.length < 2) return 0;
  const mean = verdicts.reduce((a, v) => a + v.stance, 0) / verdicts.length;
  return Math.sqrt(
    verdicts.reduce((a, v) => a + (v.stance - mean) ** 2, 0) / verdicts.length
  );
}

function diffStances(
  before: AgentVerdict[],
  after: AgentVerdict[],
  messages: AgentMessage[]
): MindChange[] {
  const prior = new Map(before.map((v) => [v.agentId, v.stance]));
  const conceded = new Set(
    messages.filter((m) => m.kind === "concession").map((m) => m.from)
  );

  return after
    .filter((v) => prior.has(v.agentId))
    .map((v) => {
      const from = prior.get(v.agentId)!;
      return {
        agentId: v.agentId,
        from,
        to: v.stance,
        delta: v.stance - from,
        conceded: conceded.has(v.agentId),
      };
    })
    .filter((c) => Math.abs(c.delta) > 0.01);
}

function summarize(verdicts: AgentVerdict[]): string {
  return verdicts
    .map((v) => `  [${v.agentId}] ${v.stance.toFixed(2)} — ${v.position}`)
    .join("\n");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
