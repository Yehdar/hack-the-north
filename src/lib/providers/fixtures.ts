import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LLMProvider, LLMRequest } from "@/lib/llm";

// ============================================================================
// RECORD / REPLAY - B6, the stage insurance policy.
//
// Record one real run against a real model, then replay it with the network
// off. Venue wifi failing during a three-minute demo is not hypothetical, and
// "it works on my machine with good internet" is not a plan.
//
// Replay is keyed on a hash of the exact prompt, so a replayed run is the same
// deliberation rather than an approximation of one.
// ============================================================================

const FIXTURE_PATH = join(process.cwd(), "fixtures", "llm.json");

type Fixtures = Record<string, string>;

function keyOf(req: LLMRequest): string {
  return createHash("sha256")
    .update(req.system)
    .update(" ")
    .update(req.user)
    .update(" ")
    .update(req.schema?.name ?? "")
    .digest("hex")
    .slice(0, 32);
}

function load(): Fixtures {
  if (!existsSync(FIXTURE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixtures;
  } catch {
    return {};
  }
}

/** Wraps a real provider and writes every exchange to disk. */
export class RecordingProvider implements LLMProvider {
  readonly name: string;
  private inner: LLMProvider;
  private fixtures: Fixtures;

  constructor(inner: LLMProvider) {
    this.inner = inner;
    this.name = `${inner.name}+recording`;
    this.fixtures = load();
  }

  async complete(req: LLMRequest): Promise<string> {
    const raw = await this.inner.complete(req);
    this.fixtures[keyOf(req)] = raw;
    this.flush();
    return raw;
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    return JSON.parse(await this.complete(req)) as T;
  }

  private flush() {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, JSON.stringify(this.fixtures, null, 2));
  }
}

/**
 * Serves recorded responses. Falls through to a stand-in provider on a miss,
 * so an unrecorded prompt degrades to something plausible rather than throwing
 * in front of an audience.
 */
export class ReplayProvider implements LLMProvider {
  readonly name = "replay";
  private fixtures: Fixtures;
  private fallback: LLMProvider;
  private misses = 0;

  constructor(fallback: LLMProvider) {
    this.fixtures = load();
    this.fallback = fallback;
  }

  get recorded(): number {
    return Object.keys(this.fixtures).length;
  }

  async complete(req: LLMRequest): Promise<string> {
    const hit = this.fixtures[keyOf(req)];
    if (hit !== undefined) {
      // Real latency, so a replayed run paces like the recorded one instead of
      // resolving suspiciously fast.
      await delay(300 + Math.random() * 700);
      return hit;
    }
    this.misses++;
    console.warn(`[replay] miss ${this.misses} (${req.schema?.name ?? "text"})`);
    return this.fallback.complete(req);
  }

  async completeJSON<T>(req: LLMRequest): Promise<T> {
    return JSON.parse(await this.complete(req)) as T;
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
