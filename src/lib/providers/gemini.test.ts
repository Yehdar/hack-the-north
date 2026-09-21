import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider, resetGeminiBudget } from "@/lib/providers/gemini";
import type { LLMProvider, LLMRequest } from "@/lib/llm";

// ============================================================================
// The free tier is a quota, and a quota runs out. Everything below is one
// claim: when Google says no, for any reason, the run carries on rather than
// surfacing the refusal to whoever is watching.
// ============================================================================

const FALLBACK_TEXT = "[fallback] the demo provider answered";

function fallbackSpy(): LLMProvider & { calls: number } {
  return {
    name: "demo",
    calls: 0,
    async complete(this: { calls: number }) {
      this.calls += 1;
      return FALLBACK_TEXT;
    },
    async completeJSON<T>(this: { calls: number }): Promise<T> {
      this.calls += 1;
      return { fallback: true } as T;
    },
  } as LLMProvider & { calls: number };
}

const ask: LLMRequest = { system: "s", user: "u", tier: "deep" };

function reply(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  };
}

// The budget counters are module state, so a test that trips the throttle
// would otherwise take every test after it down with it.
beforeEach(() => resetGeminiBudget());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiProvider", () => {
  it("returns the model's text when the call succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("the market does not have that problem")));
    const demo = fallbackSpy();

    const out = await new GeminiProvider("key", demo).complete(ask);

    expect(out).toBe("the market does not have that problem");
    expect(demo.calls).toBe(0);
  });

  it("sends the key in a header, never in the URL", async () => {
    const fetchMock = vi.fn(async () => reply("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await new GeminiProvider("secret-key", fallbackSpy()).complete(ask);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("falls back to demo when the tier is throttled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota exceeded" }))
    );
    const demo = fallbackSpy();

    const out = await new GeminiProvider("key", demo).complete(ask);

    expect(out).toBe(FALLBACK_TEXT);
    expect(demo.calls).toBe(1);
  });

  it("falls back when the network is gone rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const demo = fallbackSpy();

    await expect(new GeminiProvider("key", demo).complete(ask)).resolves.toBe(FALLBACK_TEXT);
    expect(demo.calls).toBe(1);
  });

  it("treats an empty candidate as a failure, not as a silent partner", async () => {
    // What a safety block looks like, and what a call that spends its whole
    // output budget thinking looks like. Both must not reach the table as "".
    vi.stubGlobal("fetch", vi.fn(async () => reply("")));
    const demo = fallbackSpy();

    expect(await new GeminiProvider("key", demo).complete(ask)).toBe(FALLBACK_TEXT);
  });

  it("recovers JSON from a fenced block", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('```json\n{"stance": -0.4}\n```')));
    const demo = fallbackSpy();

    const out = await new GeminiProvider("key", demo).completeJSON<{ stance: number }>(ask);

    expect(out.stance).toBe(-0.4);
    expect(demo.calls).toBe(0);
  });

  it("falls back when the reply is not JSON at all", async () => {
    // The one failure a caller cannot absorb: it is reaching for fields.
    vi.stubGlobal("fetch", vi.fn(async () => reply("I would rather not answer that.")));
    const demo = fallbackSpy();

    const out = await new GeminiProvider("key", demo).completeJSON<{ fallback: boolean }>(ask);

    expect(out.fallback).toBe(true);
  });

  it("does not think on the fast tier, because the Moderator has no time to", async () => {
    const fetchMock = vi.fn(async () => reply("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await new GeminiProvider("key", fallbackSpy()).complete({ ...ask, tier: "fast" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("probe lets a failure through, so a dead key is visible at the health check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, text: async () => "API key not valid" }))
    );

    await expect(new GeminiProvider("bad", fallbackSpy()).probe("deep")).rejects.toThrow(/400/);
  });
});
