import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  checkPassword,
  passwordMeetsPolicy,
} from "@/lib/password-policy";

describe("politique de mot de passe", () => {
  it("porte les quatre règles du projet Supabase, dans l'ordre d'affichage", () => {
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
    ["Ab3defg", false], // sept caractères
    ["abcdefg1", false], // pas de majuscule
    ["ABCDEFG1", false], // pas de minuscule
    ["Abcdefgh", false], // pas de chiffre
    ["", false],
  ])("%s → %s", (password, expected) => {
    expect(passwordMeetsPolicy(password)).toBe(expected);
  });

  it("compte les majuscules comme GoTrue : en ASCII", () => {
    // « É » n'est pas `[A-Z]` côté serveur. Une liste qui la validerait ferait
    // cocher la règle à l'écran puis refuser à l'envoi.
    expect(passwordMeetsPolicy("Étrange1x")).toBe(false);
    expect(passwordMeetsPolicy("Étrange1X")).toBe(true);
  });
});
