import { describe, expect, it } from "vitest";
import { castFor, genderOf, pickVoice } from "./browserVoices";

// What a Mac with Chrome typically offers, in the order the browser lists it.
const MAC_CHROME = [
  { name: "Albert", lang: "en-US" },
  { name: "Fred", lang: "en-US" },
  { name: "Samantha", lang: "en-US" },
  { name: "Daniel", lang: "en-GB" },
  { name: "Ava (Premium)", lang: "en-US" },
  { name: "Zoe (Enhanced)", lang: "en-US" },
  { name: "Evan (Enhanced)", lang: "en-US" },
  { name: "Thomas", lang: "fr-FR" },
  { name: "Google US English", lang: "en-US" },
  { name: "Google UK English Male", lang: "en-GB" },
  { name: "Google UK English Female", lang: "en-GB" },
];

describe("picking a browser voice", () => {
  it("prefers premium and enhanced voices over the robotic defaults", () => {
    expect(pickVoice(MAC_CHROME, "female")?.name).toBe("Ava (Premium)");
    expect(pickVoice(MAC_CHROME, "male")?.name).toBe("Evan (Enhanced)");
  });

  it("gives a second partner of the same gender a different voice", () => {
    expect(pickVoice(MAC_CHROME, "female", 1)?.name).not.toBe(pickVoice(MAC_CHROME, "female", 0)?.name);
    expect(pickVoice(MAC_CHROME, "male", 1)?.name).toBe("Google UK English Male");
  });

  it("never picks a novelty voice or a non-English one", () => {
    const picks = [0, 1, 2, 3, 4, 5].map((slot) => pickVoice(MAC_CHROME, null, slot)?.name);
    expect(picks).not.toContain("Albert");
    expect(picks).not.toContain("Fred");
    expect(picks).not.toContain("Thomas");
  });

  it("reads gender from voice names, including 'Male' and 'Female' suffixes", () => {
    expect(genderOf({ name: "Google UK English Male", lang: "en-GB" })).toBe("male");
    expect(genderOf({ name: "Google UK English Female", lang: "en-GB" })).toBe("female");
    expect(genderOf({ name: "Microsoft Aria Online (Natural)", lang: "en-US" })).toBe("female");
    expect(genderOf({ name: "Microsoft Guy Online (Natural)", lang: "en-US" })).toBe("male");
  });

  it("falls back to the best voice when none of that gender exists", () => {
    const onlyMen = [{ name: "Daniel", lang: "en-GB" }, { name: "Alex", lang: "en-US" }];
    expect(pickVoice(onlyMen, "female")).not.toBeNull();
    expect(pickVoice([], "female")).toBeNull();
  });

  it("casts each library voice as the gender its figure is drawn as", () => {
    expect(castFor("21m00Tcm4TlvDq8ikWAM").gender).toBe("female");
    expect(castFor("VR6AewLTigWG4xSOukaG")).toEqual({ gender: "male", slot: 1 });
    expect(castFor(undefined).gender).toBeNull();
  });
});
