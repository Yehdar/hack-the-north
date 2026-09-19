import { afterEach, describe, expect, it, vi } from "vitest";
import { withLegacyFallback } from "./store";

// The store was renamed atlas.ventureFile -> vision.session. A session saved
// under the old name must survive the rename, which zustand's migrate alone
// never delivered: it only reads the current key.

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const LEGACY = JSON.stringify({
  state: {
    ventureFile: {
      id: "vf_old",
      version: 3,
      solution: "An idea from before the rename",
      extractedProblems: [],
      hubFindings: {},
      pitchTranscript: [],
      objections: [],
    },
  },
  version: 0,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("store rename", () => {
  it("reads the old key only when the new one is empty, and retires it on write", () => {
    const mem = memoryStorage({ "atlas.ventureFile": LEGACY });
    const storage = withLegacyFallback(mem);

    expect(storage.getItem("vision.session")).toBe(LEGACY);
    expect(storage.getItem("something.else")).toBeNull();

    storage.setItem("vision.session", "{}");
    expect(mem.data.has("atlas.ventureFile")).toBe(false);
    expect(storage.getItem("vision.session")).toBe("{}");
  });

  it("hydrates the real store from a session saved before the rename", async () => {
    const mem = memoryStorage({ "atlas.ventureFile": LEGACY });
    vi.stubGlobal("localStorage", mem);
    const { useVenture } = await import("./store");

    expect(useVenture.getState().ventureFile?.solution).toBe("An idea from before the rename");
    // Fields the old store never had still get their defaults.
    expect(useVenture.getState().firmId).toBe("bessemer");

    // The next write lands under the new name and the old key is gone.
    useVenture.getState().setFirmId("radical");
    expect(mem.data.has("atlas.ventureFile")).toBe(false);
    expect(JSON.parse(mem.data.get("vision.session")!).state.firmId).toBe("radical");
  });
});
