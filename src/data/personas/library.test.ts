import { describe, expect, it } from "vitest";
import { HUB_POINTS } from "@/data/globePoints";
import { PERSONAS, inferIndustries, personasByHub, selectRelevant } from "./index";

describe("persona library", () => {
  it("has a full population with unique ids", () => {
    // Head count is driven by hubs.json, so assert the invariant rather than a
    // magic number that breaks every time a hub is added.
    expect(PERSONAS.length).toBeGreaterThan(250);
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
  });

  it("covers every hub the globe knows about", () => {
    const covered = new Set(PERSONAS.map((p) => p.hubId));
    for (const hub of HUB_POINTS) expect(covered.has(hub.id)).toBe(true);
    expect(covered.size).toBeGreaterThanOrEqual(15);
  });

  it("places everyone in a hub the globe knows about", () => {
    const known = new Set(HUB_POINTS.map((h) => h.id));
    for (const p of PERSONAS) expect(known.has(p.hubId)).toBe(true);
  });

  it("keeps every psychographic in range", () => {
    for (const p of PERSONAS) {
      for (const [, v] of Object.entries(p.psychographics)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });

  it("spreads the crowd, rather than cloning one persona 300 times", () => {
    const values = PERSONAS.map((p) => p.psychographics.techAdoption);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
    expect(sd).toBeGreaterThan(1);
  });

  it("ties budget authority to seniority, or the signal is noise", () => {
    const mean = (s: string) => {
      const group = PERSONAS.filter((p) => p.professional.seniority === s);
      return group.reduce((a, p) => a + p.psychographics.budgetAuthority, 0) / group.length;
    };
    expect(mean("Exec")).toBeGreaterThan(mean("Director"));
    expect(mean("Director")).toBeGreaterThan(mean("Senior"));
    expect(mean("Senior")).toBeGreaterThan(mean("IC"));
  });

  it("weights headcount by hub rather than spreading evenly", () => {
    const byHub = personasByHub();
    expect(byHub.sf.length).toBeGreaterThan(byHub.waterloo.length);
  });
});

describe("retrieval", () => {
  it("infers overlapping industries rather than forcing one bucket", () => {
    const found = inferIndustries(
      "A tool that reconciles hospital invoices against insurer payments."
    ).map((r) => r.industry);
    expect(found).toContain("fintech");
    expect(found).toContain("healthcare");
  });

  it("puts the affected industry at the top of the crowd", () => {
    const hits = selectRelevant(
      "An AI tool that plugs into your repo and writes unit tests for untested code.",
      { limit: 40 }
    );
    const software = hits.filter((h) => h.persona.professional.industry === "software").length;
    expect(software / hits.length).toBeGreaterThan(0.4);
  });

  it("favours people who can actually sign", () => {
    const hits = selectRelevant("A payments reconciliation platform.", { limit: 50 });
    const selected =
      hits.reduce((a, h) => a + h.persona.psychographics.budgetAuthority, 0) / hits.length;
    const overall =
      PERSONAS.reduce((a, p) => a + p.psychographics.budgetAuthority, 0) / PERSONAS.length;
    expect(selected).toBeGreaterThan(overall);
  });

  it("explains every selection", () => {
    for (const hit of selectRelevant("A developer tool for testing APIs.", { limit: 20 })) {
      expect(hit.why.length).toBeGreaterThan(0);
    }
  });

  it("can narrow to a single hub", () => {
    const hits = selectRelevant("A fintech ledger.", { limit: 20, hubId: "berlin" });
    expect(hits.every((h) => h.persona.hubId === "berlin")).toBe(true);
  });
});
