import { describe, expect, it } from "vitest";
import { preReadAll } from "./preread";
import { SEATS } from "./seats";
import { MOCK_VENTURE_FILE } from "@/mocks/ventureFile.mock";
import { ventureFileToContext } from "./context";
import type { VentureFile } from "@/lib/types";

// No OPENAI_API_KEY in the test env, so getLLM() resolves to the mock provider.
// These assert the contract and the degradation paths, not model quality.

describe("preReadAll", () => {
  it("returns one read per seat", async () => {
    const reads = await preReadAll(MOCK_VENTURE_FILE);
    expect(reads.map((r) => r.seatId).sort()).toEqual(
      Object.keys(SEATS).sort()
    );
  });

  it("holds the model to at most two questions", async () => {
    const reads = await preReadAll(MOCK_VENTURE_FILE);
    for (const r of reads) {
      expect(r.topQuestions.length).toBeLessThanOrEqual(2);
    }
  });

  it("keeps lean inside [-1, 1]", async () => {
    const reads = await preReadAll(MOCK_VENTURE_FILE);
    for (const r of reads) {
      expect(r.initialLean).toBeGreaterThanOrEqual(-1);
      expect(r.initialLean).toBeLessThanOrEqual(1);
    }
  });
});

describe("ventureFileToContext", () => {
  it("flags that the founder was moved off their original problem", () => {
    const ctx = ventureFileToContext(MOCK_VENTURE_FILE);
    expect(ctx).toContain("the research moved them");
  });

  it("calls out a PVS below threshold as expensive", () => {
    const ctx = ventureFileToContext(MOCK_VENTURE_FILE);
    expect(ctx).toContain("NOT cleared");
    expect(ctx).toContain("pitch anyway");
  });

  it("states plainly when discovery has not run at all", () => {
    const bare: VentureFile = {
      id: "vf_bare",
      version: 1,
      solution: "A thing that does a thing.",
      extractedProblems: [],
      hubFindings: {},
      pitchTranscript: [],
      objections: [],
    };
    expect(ventureFileToContext(bare)).toContain("NO VALIDATED PROBLEM STATEMENT");
  });

  it("surfaces unanswered challenges to the seats", () => {
    const withObjection: VentureFile = {
      ...MOCK_VENTURE_FILE,
      objections: [
        {
          id: "o1",
          seatId: "principal",
          text: "You have not named a competitor.",
          type: "competitor",
          status: "dodged",
          raisedAtTurn: 3,
        },
      ],
    };
    const ctx = ventureFileToContext(withObjection);
    expect(ctx).toContain("NOT YET ANSWERED");
    expect(ctx).toContain("You have not named a competitor.");
  });
});
