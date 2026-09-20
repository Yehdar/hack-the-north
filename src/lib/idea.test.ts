import { describe, expect, it } from "vitest";
import { checkIdea } from "./idea";

// The rule that decides whether 120 people get asked about a sentence. It has
// to be hard to trip by accident: a real pitch turned away is worse than a
// junk one let through, because only one of those wastes the founder's time.

describe("letting an idea through", () => {
  const real = [
    "An AI tool that plugs into your repo and writes unit tests for untested code.",
    "A self feeding machine for cats",
    "Software that reconciles invoices across three ERPs automatically.",
    "Uber for dogs",
    "CRM for SMBs in Lagos",
    "we built a thing that books haircuts",
    "An app that helps students revise for exams",
    "Marketplace connecting retired tradespeople with apprentices",
  ];

  for (const idea of real) {
    it(`lets through: ${idea.slice(0, 40)}`, () => {
      expect(checkIdea(idea).ok).toBe(true);
    });
  }
});

describe("turning junk away", () => {
  const junk: [string, RegExp][] = [
    ["", /say a bit more/i],
    ["   ", /say a bit more/i],
    ["hi", /say a bit more/i],
    ["test", /say a bit more/i],
    ["idea", /say a bit more/i],
    ["asdf", /say a bit more/i],
    ["asdfasdf asdfasdf asdfasdf", /does not look like an idea/i],
    ["qwertyuiop qwertyuiop qwerty", /does not look like an idea/i],
    ["aaaaaa bbbbbb cccccc", /does not look like an idea/i],
    ["xkcdplq mnbvcxz zxcvbnm", /does not look like an idea/i],
    ["it is for the one that we have", /does not look like an idea/i],
  ];

  for (const [text, message] of junk) {
    it(`turns away: ${JSON.stringify(text.slice(0, 30))}`, () => {
      const result = checkIdea(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(message);
    });
  }

  it("says what to do next rather than what went wrong", () => {
    const result = checkIdea("asdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toMatch(/invalid|error|failed/i);
  });
});
