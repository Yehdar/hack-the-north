import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { DemoProvider } from "@/lib/providers/demo";

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

const DEEP_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-sol";
const FAST_MODEL = process.env.OPENAI_FAST_MODEL ?? "gpt-5.6-luna";

class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(req: LLMRequest): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: req.tier === "fast" ? FAST_MODEL : DEEP_MODEL,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 800,
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

const ANTHROPIC_DEEP = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
const ANTHROPIC_FAST = process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5-20251001";

/**
 * Anthropic path. Claude has no response_format, so the schema is enforced by
 * instruction plus a prefilled assistant turn that opens the JSON object —
 * the model cannot then preface it with prose.
 */
class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: LLMRequest): Promise<string> {
    const schemaInstruction = req.schema
      ? `\n\nRespond with JSON only, matching this schema:\n${JSON.stringify(req.schema.schema)}`
      : "";

    const res = await this.client.messages.create({
      model: req.tier === "fast" ? ANTHROPIC_FAST : ANTHROPIC_DEEP,
      max_tokens: req.maxTokens ?? 800,
      temperature: req.temperature ?? 0.7,
      system: req.system + schemaInstruction,
      messages: [
        { role: "user", content: req.user },
        ...(req.schema ? [{ role: "assistant" as const, content: "{" }] : []),
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Put back the brace we prefilled.
    return req.schema ? `{${text}` : text;
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

/**
 * Explicit LLM_PROVIDER wins. Otherwise whichever key is present, OpenAI
 * first. With no key at all we fall to the demo provider, which returns
 * realistic differentiated content — so the app is runnable and demoable by
 * anyone who clones it, with nothing configured.
 */
function selectProvider(): LLMProvider {
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
