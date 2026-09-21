import type { LLMProvider, LLMRequest } from "@/lib/llm";
import { parseJSON } from "@/lib/llm";

// ============================================================================
// GEMINI, THE FREE TIER.
//
// The deployed app has to be free to run and it has to keep working when a
// stranger opens it, and those two things pull against each other: a free
// quota is a quota, and the moment it runs out an unguarded app starts
// throwing 429s at whoever happened to click the link.
//
// So this provider is built to degrade rather than fail. Every call that does
// not come back with text, for any reason, quietly falls through to the demo
// provider, which needs no key and no network. A visitor never sees an error,
// they see a slightly less interesting committee.
//
// No SDK. One fetch against a documented REST endpoint is less code than the
// client wrapper around it, and one fewer dependency to keep current.
// ============================================================================

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Deep tier: seat reasoning, cross-examination, rebuttal. 15 RPM / 1,500 RPD. */
const DEEP = process.env.GEMINI_MODEL || "gemini-2.5-flash";
/** Fast tier: the Moderator, on every founder speech turn. 30 RPM, same daily. */
const FAST = process.env.GEMINI_FAST_MODEL || "gemini-2.5-flash-lite";

const TIMEOUT_MS = 30_000;

/**
 * How much of the output budget the model may spend thinking before it answers.
 *
 * The 2.5 Flash models reason by default and that reasoning is billed against
 * maxOutputTokens, so an unconfigured call can think its way through the whole
 * budget and return an empty candidate. The Moderator has under a second to
 * decide whether a partner interrupts, so it never thinks at all.
 */
const THINKING: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 1024,
  high: 4096,
};

const EFFORT: "low" | "medium" | "high" =
  (["low", "medium", "high"] as const).find((e) => e === process.env.LLM_EFFORT) ?? "low";

/**
 * A budget the free tier is not supposed to exceed.
 *
 * This counts within one server instance, and a serverless deployment runs
 * several, so it is a brake rather than a guarantee. The real protection is
 * the fallback below: when Google says no, the run continues on the demo
 * provider instead of surfacing the refusal. Deliberately under Google's
 * published 1,500 so a burst near the ceiling still leaves room.
 */
const DAILY_BUDGET = Number(process.env.GEMINI_DAILY_BUDGET ?? 1200);

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How long a throttle takes the provider off the field.
 *
 * The free tier limits by the minute as well as by the day, and the per-minute
 * one is the one a live deliberation trips: fifteen calls arrive in well under
 * a minute. Treating that as the day being over was wrong, and wrong in the
 * expensive direction, because it meant one burst near the start of a demo
 * dropped everything after it to synthetic output. A minute of cooling off
 * clears a per-minute throttle; a daily one simply re-trips this on the next
 * call, which costs one request an hour.
 */
const COOLDOWN_MS = 60_000;

let spent = 0;
let windowStartedAt = Date.now();
let cooldownUntil = 0;

function available(): boolean {
  if (Date.now() - windowStartedAt > DAY_MS) {
    spent = 0;
    windowStartedAt = Date.now();
  }
  return spent < DAILY_BUDGET && Date.now() >= cooldownUntil;
}

/** What the provider has used, for the system panel. */
export function geminiBudget(): { spent: number; budget: number; throttled: boolean } {
  return { spent, budget: DAILY_BUDGET, throttled: Date.now() < cooldownUntil };
}

/** Test seam. The counters are module state by design, so a suite that
 *  exercises throttling has to be able to put them back. */
export function resetGeminiBudget(): void {
  spent = 0;
  windowStartedAt = Date.now();
  cooldownUntil = 0;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  constructor(
    private apiKey: string,
    /** Where a refused, throttled or empty call goes instead. */
    private fallback: LLMProvider
  ) {}

  async complete(req: LLMRequest): Promise<string> {
    if (!available()) return this.fallback.complete(req);

    const model = req.tier === "fast" ? FAST : DEEP;

    // Claude has no response_format either, and the same approach works here:
    // ask for the shape in the system prompt and let parseJSON recover the
    // object from whatever fences or prose come back. Gemini's responseSchema
    // accepts only a subset of JSON Schema, so translating our schemas into it
    // would be a second source of failures for no gain.
    const schemaInstruction = req.schema
      ? `\n\nRespond with JSON only, matching this schema:\n${JSON.stringify(req.schema.schema)}`
      : "";

    const body = {
      systemInstruction: { parts: [{ text: req.system + schemaInstruction }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: (req.maxTokens ?? 800) + THINKING[EFFORT],
        thinkingConfig: {
          thinkingBudget: req.tier === "fast" ? 0 : THINKING[EFFORT],
        },
        ...(req.schema ? { responseMimeType: "application/json" } : {}),
      },
    };

    try {
      spent += 1;
      const text = await this.call(model, body);
      // An empty candidate is what a safety block and a budget exhausted by
      // thinking both look like. Neither is worth showing as a silent partner.
      return text.trim() ? text : this.fallback.complete(req);
    } catch (err) {
      console.warn(`[gemini] ${model} failed, falling back to demo:`, (err as Error).message);
      return this.fallback.complete(req);
    }
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    const raw = await this.complete(req);
    try {
      return parseJSON<T>(raw);
    } catch {
      // Unparseable is the one failure the caller cannot absorb, because it is
      // reaching for fields. A structurally valid answer from the demo
      // provider beats a thrown error on stage.
      return this.fallback.completeJSON<T>(req);
    }
  }

  /**
   * One call with the safety net removed, so a failure is visible.
   *
   * Everything else here swallows errors by design, which is right in front of
   * an audience and wrong at /api/system/check: a bad key would fall through to
   * the demo provider and report itself healthy, which is the exact failure the
   * health check exists to catch.
   */
  async probe(tier: "fast" | "deep"): Promise<string> {
    const model = tier === "fast" ? FAST : DEEP;
    return this.call(model, {
      contents: [{ role: "user", parts: [{ text: 'Reply with exactly: {"ok": true}' }] }],
      generationConfig: {
        maxOutputTokens: 32,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
      },
    });
  }

  private async call(model: string, body: unknown): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // In the header rather than the query string: a key in a URL ends up
          // in access logs and error traces.
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // 429 is the free tier doing its job. Step back for a minute rather
        // than retrying into a wall.
        if (res.status === 429) cooldownUntil = Date.now() + COOLDOWN_MS;
        throw new Error(`${res.status} ${detail.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };

      return (
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? ""
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
