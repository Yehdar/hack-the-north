import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { DemoProvider } from "@/lib/providers/demo";
import { RecordingProvider, ReplayProvider } from "@/lib/providers/fixtures";

// ============================================================================
// LLM PROVIDER SEAM — shared, frozen after the 1.5h sync.
//
// SERVER ONLY. Never import this into a client component: it reads API keys.
// All model traffic goes through API routes.
//
// Both tracks call this. The point of the seam is that the mock provider lets
// either track build a full feature before a key exists, and DEMO_MODE swaps
// the real provider out on stage without touching agent code.
// ============================================================================

export type LLMRequest = {
  system: string;
  user: string;
  /** When present, the model is asked for JSON matching this schema. */
  schema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
  /** "fast" for the Moderator, "deep" for seat reasoning. */
  tier?: "fast" | "deep";
};

export interface LLMProvider {
  readonly name: string;
  complete(req: LLMRequest): Promise<string>;
  completeJSON<T>(req: LLMRequest): Promise<T>;
}

// ---------------------------------------------------------------------------
// MODEL SELECTION — see ARCHITECTURE.md for the full reasoning.
//
// DEEP (gpt-5.6-sol): seat reasoning, cross-examination, rebuttal. This is the
//   hardest thinking in the app — holding a persona under pressure and finding
//   the non-obvious objection. ~15 calls per deliberation at roughly 2k in /
//   0.5k out each, so about $0.27 a run. Worth it; persona fidelity is the
//   product.
//
// FAST (gpt-5.6-luna): the Moderator, which runs on EVERY founder speech turn
//   and must decide in under a second whether a seat interrupts. 20x cheaper
//   than Sol and built for exactly this high-volume, low-latency shape.
//
// Not gpt-6-astra: our calls are small, structured, and numerous. Astra is
//   built for hard end-to-end agentic work over huge contexts, which is not
//   the shape of this workload. Set OPENAI_MODEL=gpt-6-astra to upgrade if
//   seat quality ever looks like the bottleneck.
// ---------------------------------------------------------------------------

// `||`, not `??`: a blank line in .env.local is an empty string, which would
// otherwise be sent as the model name on every call.
const DEEP_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna";

// ---------------------------------------------------------------------------
// LIVE-CALL SAFETY. Neither real provider had run against its API when these
// were written, and each of the following is a 400 on every call — which the
// callers absorb as neutral placeholders, so the failure looks like a demo that
// runs and says nothing rather than like an error.
// ---------------------------------------------------------------------------

/** One hung call must not hold the room: the SDK default is ten minutes, with
 *  two retries on top. */
const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 1;

/** How hard reasoning models think before answering. Low keeps a deliberation
 *  of ~15 calls fast enough to watch live; raise it for rehearsal quality. */
const EFFORT: "low" | "medium" | "high" = (["low", "medium", "high"] as const).find(
  (e) => e === process.env.LLM_EFFORT
) ?? "low";

/** Headroom for thinking, which shares the output cap with the answer. Sized
 *  for the JSON alone, a model that reasons first runs out mid-object. */
const THINKING_ROOM = 4000;

/** o-series and GPT-5 onwards reason before answering, reject a custom
 *  temperature, and reject the legacy max_tokens parameter. */
const OPENAI_REASONING = /^(o\d|gpt-5)/;

class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  }

  async complete(req: LLMRequest): Promise<string> {
    const model = req.tier === "fast" ? FAST_MODEL : DEEP_MODEL;
    const reasons = OPENAI_REASONING.test(model);
    const res = await this.client.chat.completions.create({
      model,
      // max_completion_tokens is accepted by every chat model; max_tokens is
      // refused by reasoning models. Temperature is only for the ones that
      // take it, so the persona spread rests on the prompts there.
      max_completion_tokens: (req.maxTokens ?? 800) + (reasons ? THINKING_ROOM : 0),
      ...(reasons
        ? { reasoning_effort: EFFORT }
        : { temperature: req.temperature ?? 0.7 }),
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      ...(req.schema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: req.schema.name,
                schema: req.schema.schema,
                strict: false,
              },
            },
          }
        : {}),
    });
    return res.choices[0]?.message?.content ?? "";
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    const raw = await this.complete(req);
    return parseJSON<T>(raw);
  }
}

const ANTHROPIC_DEEP = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const ANTHROPIC_FAST = process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-5";

// What each Claude generation accepts, by model id.
/** 4.7 onwards: temperature, top_p and top_k are rejected. */
const CLAUDE_NO_SAMPLING = /claude-(opus-5|opus-4-[78]|sonnet-5|fable|mythos)/;
/** Takes output_config.effort. */
const CLAUDE_EFFORT = /claude-(opus-5|opus-4-[5678]|sonnet-5|sonnet-4-6|fable|mythos)/;
/** Thinks unless told not to — and thinking counts against max_tokens. */
const CLAUDE_THINKS = /claude-(opus-5|sonnet-5|fable|mythos)/;
/** Safety classifiers can decline; a server-side fallback re-runs the request
 *  on the model Anthropic recommends for that category of decline. */
const CLAUDE_FALLBACK = /claude-(opus-5|fable-5-1)/;

/**
 * Anthropic path. Claude has no response_format here, so the schema is asked
 * for in the system prompt and parseJSON recovers the object from any fences
 * or prose around it.
 *
 * It used to prefill the assistant turn with "{" as well. Every model from the
 * 4.6 generation on — including the default, claude-opus-5 — rejects a
 * prefill with a 400, as it does the temperature this also used to send.
 */
class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  }

  async complete(req: LLMRequest): Promise<string> {
    const model = req.tier === "fast" ? ANTHROPIC_FAST : ANTHROPIC_DEEP;
    const maxTokens = req.maxTokens ?? 800;
    const schemaInstruction = req.schema
      ? `\n\nRespond with JSON only, matching this schema:\n${JSON.stringify(req.schema.schema)}`
      : "";

    const res = await this.client.beta.messages.create({
      model,
      max_tokens: CLAUDE_THINKS.test(model) ? maxTokens + THINKING_ROOM : maxTokens,
      ...(CLAUDE_NO_SAMPLING.test(model) ? {} : { temperature: req.temperature ?? 0.7 }),
      ...(CLAUDE_EFFORT.test(model) ? { output_config: { effort: EFFORT } } : {}),
      ...(CLAUDE_FALLBACK.test(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system: req.system + schemaInstruction,
      messages: [{ role: "user", content: req.user }],
    });

    // A decline arrives as a normal response with no answer in it. Thrown, so
    // the caller's placeholder path takes over rather than parsing nothing.
    if (res.stop_reason === "refusal") {
      throw new Error(`${model} declined the request (${res.stop_details?.category ?? "no category"})`);
    }

    return res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    return parseJSON<T>(await this.complete(req));
  }
}

/**
 * Deterministic stand-in. Returns structurally valid, obviously-fake output so
 * a feature can be built and typechecked end to end with no key and no network.
 */
class MockProvider implements LLMProvider {
  readonly name = "mock";

  async complete(req: LLMRequest): Promise<string> {
    await delay(200 + Math.random() * 400);
    if (req.schema) return JSON.stringify(mockForSchema(req.schema.schema));
    return "[mock] This is placeholder output from the mock LLM provider.";
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    const raw = await this.complete(req);
    return parseJSON<T>(raw);
  }
}

let cached: LLMProvider | null = null;

export function getLLM(): LLMProvider {
  if (cached) return cached;

  cached = selectProvider();
  console.log(`[llm] provider: ${cached.name}`);
  return cached;
}

/** The models the selected provider actually calls. The system panel used to
 *  read the env vars directly, and showed "demo" for a live provider running
 *  on its default models. */
export function activeModels(): { deep: string; fast: string } {
  const name = getLLM().name;
  if (name.startsWith("openai")) return { deep: DEEP_MODEL, fast: FAST_MODEL };
  if (name.startsWith("anthropic")) return { deep: ANTHROPIC_DEEP, fast: ANTHROPIC_FAST };
  return { deep: name, fast: name };
}

/**
 * Explicit LLM_PROVIDER wins. Otherwise whichever key is present, OpenAI
 * first. With no key at all we fall to the demo provider, which returns
 * realistic differentiated content — so the app is runnable and demoable by
 * anyone who clones it, with nothing configured.
 */
function selectProvider(): LLMProvider {
  // Replay wins over everything: on stage we want the recorded run, not a live
  // call that can hang on venue wifi.
  if (process.env.DEMO_MODE === "1") return new ReplayProvider(new DemoProvider());

  const base = selectBase();

  // Recording wraps whatever was selected, including the demo provider, so the
  // record path can be exercised before any key exists.
  return process.env.RECORD_FIXTURES === "1" ? new RecordingProvider(base) : base;
}

function selectBase(): LLMProvider {
  const forced = process.env.LLM_PROVIDER;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (forced === "mock") return new MockProvider();
  if (forced === "demo") return new DemoProvider();
  if (forced === "openai" && openaiKey) return new OpenAIProvider(openaiKey);
  if (forced === "anthropic" && anthropicKey) return new AnthropicProvider(anthropicKey);

  if (openaiKey) return new OpenAIProvider(openaiKey);
  if (anthropicKey) return new AnthropicProvider(anthropicKey);
  return new DemoProvider();
}

/** Models sometimes wrap JSON in prose or a fenced block. Recover rather than throw. */
export function parseJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim()) as T;

    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error(`LLM returned unparseable JSON: ${trimmed.slice(0, 200)}`);
  }
}

function mockForSchema(schema: Record<string, unknown>): unknown {
  const type = schema.type as string | undefined;

  if (type === "object") {
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, mockForSchema(v)])
    );
  }
  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined;
    return items ? [mockForSchema(items)] : [];
  }
  if (type === "number" || type === "integer") return 0.5;
  if (type === "boolean") return true;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  return "[mock]";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
