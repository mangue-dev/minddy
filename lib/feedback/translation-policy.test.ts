import { describe, expect, it } from "vitest";
import {
  effectiveSkipLanguages,
  shouldTranslateFeedback,
  type FeedbackTranslationSettings,
} from "@/lib/feedback/translation-policy";
import { languageLabel, normalizeLanguage } from "@/lib/feedback/languages";

function settings(
  over: Partial<FeedbackTranslationSettings> = {}
): FeedbackTranslationSettings {
  return { enabled: true, teamLanguage: "fr", skipLanguages: [], ...over };
}

describe("normalizeLanguage — ce qui entre en base", () => {
  it("keeps the primary subcode regardless of region", () => {
    expect(normalizeLanguage("pt-BR")).toBe("pt");
    expect(normalizeLanguage("pt_BR")).toBe("pt");
    expect(normalizeLanguage("  EN  ")).toBe("en");
  });

  it("rejects a language name instead of guessing it", () => {
    expect(normalizeLanguage("Portuguese")).toBeNull();
    expect(normalizeLanguage("por")).toBeNull();
  });

  it("rejects a language outside the closed set", () => {
    expect(normalizeLanguage("sv")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(42)).toBeNull();
  });
});

describe("shouldTranslateFeedback", () => {
  it("translates an unlisted foreign language", () => {
    expect(shouldTranslateFeedback(settings(), "pt")).toBe(true);
  });

  it("ne traduit pas vers la langue de l'équipe", () => {
    expect(shouldTranslateFeedback(settings(), "fr")).toBe(false);
    // Same feedback, written by a Quebecer: it’s the same team that reads it.
    expect(shouldTranslateFeedback(settings(), "fr-CA")).toBe(false);
  });

  it("respecte la liste blanche", () => {
    const s = settings({ skipLanguages: ["en"] });
    expect(shouldTranslateFeedback(s, "en")).toBe(false);
    expect(shouldTranslateFeedback(s, "de")).toBe(true);
  });

  it("checks the allowlist against the normalized code", () => {
    const s = settings({ skipLanguages: ["EN-GB"] });
    expect(shouldTranslateFeedback(s, "en")).toBe(false);
  });

  it("translates nothing when the project has disabled translation", () => {
    expect(shouldTranslateFeedback(settings({ enabled: false }), "pt")).toBe(false);
  });

  it("s'abstient quand la langue n'a pas été reconnue", () => {
    // A false translation costs more than an absent translation: the team
    // would read it without knowing that it is false.
    expect(shouldTranslateFeedback(settings(), null)).toBe(false);
    expect(shouldTranslateFeedback(settings(), "klingon")).toBe(false);
  });
});

describe("effectiveSkipLanguages", () => {
  it("inclut d'office la langue de l'équipe", () => {
    expect(effectiveSkipLanguages(settings())).toEqual(["fr"]);
  });

  it("deduplicates and normalizes the rest", () => {
    const s = settings({ skipLanguages: ["en", "EN-GB", "fr", "sv"] });
    expect(effectiveSkipLanguages(s)).toEqual(["fr", "en"]);
  });
});

describe("languageLabel — ce que l'utilisateur lit", () => {
  it("names the language in the viewer's language", () => {
    expect(languageLabel("de", "en")).toBe("German");
    expect(languageLabel("de", "fr")).toBe("Allemand");
  });

  it("adds an uppercase initial, which French does not have", () => {
    // The name never appears in a sentence: it is a list option,
    // “French” side of the app’s language selector.
    expect(languageLabel("en", "fr")).toBe("Anglais");
    expect(languageLabel("ja", "fr")).toBe("Japonais");
  });

  it("leaves casing-free scripts intact", () => {
    expect(languageLabel("ja", "ja")).toBe("日本語");
  });

  it("falls back to the code rather than nothing", () => {
    // A MALFORMED locale raises `Intl.DisplayNames` (RangeError) — this is
    // this case that the `catch` catches up. A simply unknown local, she,
    // do not raise: ICU falls back to a default locale by itself.
    expect(languageLabel("de", "!!")).toBe("de");
    expect(languageLabel("de", "zzz-invalid")).toBe("German");
  });
});
