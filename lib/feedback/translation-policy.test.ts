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
  it("garde le sous-code principal, quelle que soit la région", () => {
    expect(normalizeLanguage("pt-BR")).toBe("pt");
    expect(normalizeLanguage("pt_BR")).toBe("pt");
    expect(normalizeLanguage("  EN  ")).toBe("en");
  });

  it("refuse un nom de langue plutôt que de le deviner", () => {
    expect(normalizeLanguage("Portuguese")).toBeNull();
    expect(normalizeLanguage("por")).toBeNull();
  });

  it("refuse une langue hors du jeu fermé", () => {
    expect(normalizeLanguage("sv")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(42)).toBeNull();
  });
});

describe("shouldTranslateFeedback", () => {
  it("traduit une langue étrangère non listée", () => {
    expect(shouldTranslateFeedback(settings(), "pt")).toBe(true);
  });

  it("ne traduit pas vers la langue de l'équipe", () => {
    expect(shouldTranslateFeedback(settings(), "fr")).toBe(false);
    // Même retour, écrit par un Québécois : c'est la même équipe qui le lit.
    expect(shouldTranslateFeedback(settings(), "fr-CA")).toBe(false);
  });

  it("respecte la liste blanche", () => {
    const s = settings({ skipLanguages: ["en"] });
    expect(shouldTranslateFeedback(s, "en")).toBe(false);
    expect(shouldTranslateFeedback(s, "de")).toBe(true);
  });

  it("compare la liste blanche sur le code normalisé", () => {
    const s = settings({ skipLanguages: ["EN-GB"] });
    expect(shouldTranslateFeedback(s, "en")).toBe(false);
  });

  it("ne traduit rien quand le projet a coupé la traduction", () => {
    expect(shouldTranslateFeedback(settings({ enabled: false }), "pt")).toBe(false);
  });

  it("s'abstient quand la langue n'a pas été reconnue", () => {
    // Une traduction fausse coûte plus cher qu'une traduction absente : l'équipe
    // la lirait sans savoir qu'elle est fausse.
    expect(shouldTranslateFeedback(settings(), null)).toBe(false);
    expect(shouldTranslateFeedback(settings(), "klingon")).toBe(false);
  });
});

describe("effectiveSkipLanguages", () => {
  it("inclut d'office la langue de l'équipe", () => {
    expect(effectiveSkipLanguages(settings())).toEqual(["fr"]);
  });

  it("dédoublonne et normalise le reste", () => {
    const s = settings({ skipLanguages: ["en", "EN-GB", "fr", "sv"] });
    expect(effectiveSkipLanguages(s)).toEqual(["fr", "en"]);
  });
});

describe("languageLabel — ce que l'utilisateur lit", () => {
  it("nomme la langue dans la langue de qui regarde", () => {
    expect(languageLabel("de", "en")).toBe("German");
    expect(languageLabel("de", "fr")).toBe("Allemand");
  });

  it("met une majuscule, que le français n'a pas", () => {
    // Le nom n'apparaît jamais dans une phrase : c'est une option de liste, à
    // côté du « Français » du sélecteur de langue de l'app.
    expect(languageLabel("en", "fr")).toBe("Anglais");
    expect(languageLabel("ja", "fr")).toBe("Japonais");
  });

  it("laisse intactes les écritures sans casse", () => {
    expect(languageLabel("ja", "ja")).toBe("日本語");
  });

  it("retombe sur le code plutôt que sur rien", () => {
    // Une locale MALFORMÉE fait lever `Intl.DisplayNames` (RangeError) — c'est
    // ce cas-là que le `catch` rattrape. Une locale simplement inconnue, elle,
    // ne lève pas : ICU retombe tout seul sur une locale par défaut.
    expect(languageLabel("de", "!!")).toBe("de");
    expect(languageLabel("de", "zzz-invalid")).toBe("German");
  });
});
