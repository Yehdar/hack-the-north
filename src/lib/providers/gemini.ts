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

// The 2.5 line is retired for keys issued after roughly mid-2026: the API
// answers 404 "no longer available to new users", so a fresh clone with a fresh
// key would silently serve demo output. Pinned rather than an alias on purpose —
// gemini-flash-latest was returning 503 on most calls when this was chosen.
/** Deep tier: seat reasoning, cross-examination, rebuttal. */
const DEEP = process.env.GEMINI_MODEL || "gemini-3.6-flash";
/** Fast tier: the Moderator, on every founder speech turn. Same model as the
 *  deep tier by default, so the two share one rate limit: the -lite line is
 *  cheaper and faster but was the least reliable of the models tested. Point
 *  GEMINI_FAST_MODEL at a -lite model to split them again. */
const FAST = process.env.GEMINI_FAST_MODEL || "gemini-3.6-flash";

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

    // Omitted rather than sent as zero: the -lite models reject an explicit
    // thinkingBudget of 0 with a 400, and the fast tier is the Moderator, so
    // sending it would drop every speech turn to the demo provider mid-pitch.
    // Left out, those models simply do not think, which is what we wanted.
    const budget = req.tier === "fast" ? 0 : THINKING[EFFORT];

    const body = {
      systemInstruction: { parts: [{ text: req.system + schemaInstruction }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: (req.maxTokens ?? 800) + THINKING[EFFORT],
        ...(budget > 0 ? { thinkingConfig: { thinkingBudget: budget } } : {}),
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
        // No thinkingConfig here for the same reason as above: sending a zero
        // budget 400s on the -lite models, and a health check that fails for a
        // reason unrelated to the key is worse than no health check.
        maxOutputTokens: 32,
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
