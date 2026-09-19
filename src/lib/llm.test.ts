import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// ============================================================================
// The request shapes the live providers send, pinned against a local stand-in
// for each API.
//
// Neither provider had ever run against its real API. Each rule below is a 400
// on every call when broken — and callers absorb failed calls as neutral
// placeholders, so a broken shape shows up as a demo that runs and says
// nothing. Cheaper to pin here than to find on stage.
// ============================================================================

type Seen = { url: string; headers: IncomingHttpHeaders; body: Record<string, unknown> };

let server: Server;
let base = "";
const seen: Seen[] = [];
let reply: (url: string) => unknown = () => ({});

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen.push({ url: req.url ?? "", headers: req.headers, body: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply(req.url ?? "")));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

afterEach(() => {
  seen.length = 0;
  vi.unstubAllEnvs();
});

const claudeMessage = (text: string, stop_reason = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "test",
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

const chatCompletion = (content: string) => ({
  id: "chatcmpl_test",
  object: "chat.completion",
  created: 0,
  model: "test",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
});

/** A fresh llm module, so model defaults are read from this test's env. */
async function provider(env: Record<string, string>) {
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEMO_MODE", "RECORD_FIXTURES", "OPENAI_MODEL", "OPENAI_FAST_MODEL", "ANTHROPIC_MODEL", "ANTHROPIC_FAST_MODEL", "LLM_EFFORT"]) {
    vi.stubEnv(key, "");
  }
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.resetModules();
  const llm = await import("./llm");
  return llm.getLLM();
}

const ASK = {
  system: "You are a partner.",
  user: "Rate it.",
  schema: { name: "verdict", schema: { type: "object", properties: { ok: { type: "boolean" } } } },
  temperature: 0.9,
  maxTokens: 800,
};

describe("anthropic provider", () => {
  it("sends claude-opus-5 no prefill, no temperature, room to think, and a fallback", async () => {
    reply = () => claudeMessage('{"ok": true}');
    const llm = await provider({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: base });

    expect(await llm.completeJSON({ ...ASK, tier: "deep" })).toEqual({ ok: true });

    const { body, headers } = seen[0];
    expect(body.model).toBe("claude-opus-5");
    // A prefilled assistant turn is a 400 from the 4.6 generation on.
    expect(body.messages).toEqual([{ role: "user", content: "Rate it." }]);
    // Sampling parameters are a 400 from 4.7 on.
    expect(body).not.toHaveProperty("temperature");
    // Thinking is on by default and shares max_tokens with the answer.
    expect(body.max_tokens).toBeGreaterThan(800);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.fallbacks).toBe("default");
    expect(String(headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(String(body.system)).toContain("Respond with JSON only");
  });

  it("keeps temperature for Haiku, which accepts it and neither thinks nor falls back", async () => {
    reply = () => claudeMessage('{"ok": true}');
    const llm = await provider({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: base });

    await llm.completeJSON({ ...ASK, tier: "fast" });

    const { body } = seen[0];
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.temperature).toBe(0.9);
    expect(body.max_tokens).toBe(800);
    expect(body).not.toHaveProperty("output_config");
    expect(body).not.toHaveProperty("fallbacks");
  });

  it("throws on a refusal instead of parsing an answer that is not there", async () => {
    reply = () => claudeMessage("", "refusal");
    const llm = await provider({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: base });

    await expect(llm.completeJSON({ ...ASK, tier: "deep" })).rejects.toThrow(/declined/);
  });

  it("reads JSON out of prose around it, now that nothing prefills the brace", async () => {
    reply = () => claudeMessage('Here it is:\n```json\n{"ok": true}\n```');
    const llm = await provider({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: base });

    expect(await llm.completeJSON({ ...ASK, tier: "deep" })).toEqual({ ok: true });
  });
});

describe("openai provider", () => {
  it("sends reasoning models max_completion_tokens and an effort, never temperature", async () => {
    reply = () => chatCompletion('{"ok": true}');
    const llm = await provider({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: `${base}/v1` });

    expect(await llm.completeJSON({ ...ASK, tier: "deep" })).toEqual({ ok: true });

    const { body } = seen[0];
    expect(body.model).toBe("gpt-5.6-sol");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_completion_tokens).toBeGreaterThan(800);
    expect(body.reasoning_effort).toBe("low");
  });

  it("keeps temperature, and no reasoning effort, for a model that is not a reasoner", async () => {
    reply = () => chatCompletion('{"ok": true}');
    const llm = await provider({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: `${base}/v1`, OPENAI_MODEL: "gpt-4.1" });

    await llm.completeJSON({ ...ASK, tier: "deep" });

    const { body } = seen[0];
    expect(body.temperature).toBe(0.9);
    expect(body.max_completion_tokens).toBe(800);
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("honours LLM_EFFORT", async () => {
    reply = () => chatCompletion('{"ok": true}');
    const llm = await provider({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: `${base}/v1`, LLM_EFFORT: "medium" });

    await llm.completeJSON({ ...ASK, tier: "fast" });
    expect(seen[0].body.reasoning_effort).toBe("medium");
  });
});
