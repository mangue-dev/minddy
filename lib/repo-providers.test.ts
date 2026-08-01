import { describe, expect, it } from "vitest";
import { parseForgeLogin, prIdentifier } from "./repo-providers";

describe("parseForgeLogin", () => {
  it("détache le suffixe `[bot]` du nom", () => {
    expect(parseForgeLogin("vercel[bot]")).toEqual({ name: "vercel", isBot: true });
    expect(parseForgeLogin("dependabot[bot]")).toEqual({ name: "dependabot", isBot: true });
  });

  it("laisse un login humain intact", () => {
    expect(parseForgeLogin("clementguerin")).toEqual({
      name: "clementguerin",
      isBot: false,
    });
    // Un login qui CONTIENT « bot » n'en est pas un.
    expect(parseForgeLogin("robotnik").isBot).toBe(false);
    // Le suffixe ne compte qu'à la fin.
    expect(parseForgeLogin("[bot]vercel").isBot).toBe(false);
  });

  it("ne rend pas une pastille sans nom devant", () => {
    expect(parseForgeLogin("[bot]")).toEqual({ name: "[bot]", isBot: false });
  });

  it("supporte la casse et les espaces des logins recopiés", () => {
    expect(parseForgeLogin("  Vercel[BOT] ")).toEqual({ name: "Vercel", isBot: true });
  });
});

describe("prIdentifier", () => {
  it("suit la notation de sa forge", () => {
    expect(prIdentifier("github", 30)).toBe("#30");
    expect(prIdentifier("gitlab", 30)).toBe("!30");
    // Provider inconnu ou absent : GitHub par défaut, comme `getRepoProvider`.
    expect(prIdentifier(null, 30)).toBe("#30");
  });
});
