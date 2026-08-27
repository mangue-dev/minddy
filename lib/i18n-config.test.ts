import { describe, expect, it } from "vitest";
import { supportedLocaleForTag } from "@/i18n/config";
import { detectFromAcceptLanguage } from "@/lib/accept-language";

describe("supportedLocaleForTag", () => {
  it.each([
    ["de-DE", "de"],
    ["it-IT", "it"],
    ["es-MX", "es"],
    ["pt-BR", "pt-BR"],
    ["pt", "pt-BR"],
    ["en-US", "en"],
    ["fr-FR", "fr"],
  ])("maps %s to %s", (tag, expected) => {
    expect(supportedLocaleForTag(tag)).toBe(expected);
  });

  it("does not serve Brazilian Portuguese to an explicit European Portuguese tag", () => {
    expect(supportedLocaleForTag("pt-PT")).toBeNull();
  });
});

describe("detectFromAcceptLanguage", () => {
  it("uses quality weights across supported locales", () => {
    expect(detectFromAcceptLanguage("de-DE;q=0.4,es-MX;q=0.9,en;q=0.8")).toBe("es");
  });

  it("ignores explicitly rejected languages", () => {
    expect(detectFromAcceptLanguage("de;q=0,en;q=0.5")).toBe("en");
  });
});
