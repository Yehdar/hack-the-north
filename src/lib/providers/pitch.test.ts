import { describe, expect, it } from "vitest";
import { readPitch, type Domain } from "./pitch";

// The market a pitch sits in decides every word the demo provider says about
// it: the problems it splits into, who the council thinks the buyer is, which
// incumbent the partners name. One case per market, plus the shapes that used
// to be mistaken for markets.

const MARKETS: [Domain, string][] = [
  ["pets", "A self feeding machine for cats"],
  ["software", "An AI tool that plugs into your repo and writes the tests you never got round to"],
  ["health", "A platform for hospitals to schedule nurses across wards"],
  ["money", "Software that reconciles invoices across three ERPs"],
  ["food", "An app that turns what is in your fridge into a recipe you can cook tonight"],
  ["learning", "An app that matches high school students with university tutors for an hour a week"],
  ["home", "A service that finds a cleaner for your apartment and handles the payments"],
  ["climate", "An app that measures the carbon in a household's energy use and helps them cut it"],
  ["work", "A tool that writes the first draft of a performance review for managers"],
  ["retail", "A system that keeps inventory in step for small shops that sell in person and online"],
  ["travel", "An app that rebooks your connecting flight before the airline tells you it is late"],
];

describe("reading a pitch", () => {
  it.each(MARKETS)("puts %s pitches in that market", (domain, pitch) => {
    expect(readPitch(pitch).domain).toBe(domain);
  });

  it("scores what the product acts on, not the shape it takes", () => {
    // The bug this file exists for: "software" beat "invoices", so a finance
    // product was handed back a problem about code breaking.
    expect(readPitch("Software that reconciles invoices across three ERPs").domain).toBe("money");
    expect(readPitch("A platform for landlords to collect rent").domain).not.toBe("software");
    expect(readPitch("An app that tracks your symptoms between appointments").domain).toBe("health");
    expect(readPitch("A tool that plans meals for the week").domain).toBe("food");
  });

  it("still reads a genuine developer product as one", () => {
    expect(readPitch("A dashboard that shows which code paths are riskiest to deploy").domain).toBe("software");
  });

  it("takes who it is for over what it mentions in passing", () => {
    const fridge = readPitch(
      "We built a solar-powered refrigerator for small corner shops where the grid drops out, keeping milk and medicine cold"
    );
    expect(fridge.domain).toBe("retail");
    expect(fridge.audience).toBe("shops");
  });

  it("names the audience, the animal and the product in the founder's words", () => {
    const cat = readPitch("A self feeding machine for cats");
    expect(cat.audience).toBe("cat owners");
    expect(cat.animal).toBe("cat");
    expect(cat.short).toBe("self feeding machine");
    expect(cat.consumer).toBe(true);
  });

  it("knows a business product from a consumer one", () => {
    expect(readPitch("Software that reconciles invoices across three ERPs").consumer).toBe(false);
    expect(readPitch("An app that rounds up your purchases so you save without noticing").consumer).toBe(true);
  });

  it("falls back to general rather than guessing", () => {
    expect(readPitch("A thing that makes the other thing better").domain).toBe("general");
  });
});
