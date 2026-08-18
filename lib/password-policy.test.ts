import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  checkPassword,
  passwordMeetsPolicy,
} from "@/lib/password-policy";

describe("politique de mot de passe", () => {
  it("contains the four Supabase project rules in display order", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      "passwordRuleLength",
      "passwordRuleLower",
      "passwordRuleUpper",
      "passwordRuleDigit",
    ]);
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("rend l'état de CHAQUE règle, pas seulement la première qui manque", () => {
    const state = checkPassword("abcdefgh");
    expect(state).toEqual([
      { id: "passwordRuleLength", met: true },
      { id: "passwordRuleLower", met: true },
      { id: "passwordRuleUpper", met: false },
      { id: "passwordRuleDigit", met: false },
    ]);
  });

  it.each([
    ["Correct1horse", true],
    ["Ab3defgh", true],
    ["Ab3defg", false], // seven characters
    ["abcdefg1", false], // no uppercase letter
    ["ABCDEFG1", false], // no lowercase letter
    ["Abcdefgh", false], // no digit
    ["", false],
  ])("%s → %s", (password, expected) => {
    expect(passwordMeetsPolicy(password)).toBe(expected);
  });

  it("compte les majuscules comme GoTrue : en ASCII", () => {
    // “É” is not `[A-Z]` on the server side. A list that would validate it would
    // check the rule on the screen then refuse sending.
    expect(passwordMeetsPolicy("Étrange1x")).toBe(false);
    expect(passwordMeetsPolicy("Étrange1X")).toBe(true);
  });
});
