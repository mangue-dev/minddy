import { describe, expect, it } from "vitest";
import {
  DISMISS_GRACE_CHARS,
  advanceSuggestion,
  isDismissed,
  shouldSuggest,
  windowPrefix,
} from "@/lib/inline-completion";
import {
  buildCompletionPrompt,
  sanitizeCompletion,
  MAX_COMPLETION_CHARS,
} from "@/lib/server/issue-completion";

describe("shouldSuggest", () => {
  it("se tait sur un préfixe trop court", () => {
    expect(shouldSuggest("title", "Corr")).toBe(false);
    expect(shouldSuggest("title", "Corriger le")).toBe(true);
    // La description demande plus de matière : « Repro » ne dit rien.
    expect(shouldSuggest("description", "Repro")).toBe(false);
    expect(shouldSuggest("description", "Repro : ouvrir le board")).toBe(true);
  });

  it("laisse le menu des mentions tranquille — c'est LUI qui a Tab", () => {
    expect(shouldSuggest("description", "Vu avec @cle")).toBe(false);
    expect(shouldSuggest("description", "Vu avec @")).toBe(false);
    // Une mention terminée (espace après) rend la main.
    expect(shouldSuggest("description", "Vu avec @clement ")).toBe(true);
  });

  it("ne propose rien en début de paragraphe neuf", () => {
    expect(shouldSuggest("description", "Contexte du ticket\n")).toBe(false);
    expect(shouldSuggest("description", "Contexte du ticket\n  ")).toBe(false);
  });
});

describe("advanceSuggestion", () => {
  const ghost = " bug de pagination";

  it("rogne le fantôme quand on tape exactement ce qu'il proposait", () => {
    expect(advanceSuggestion(ghost, "Corriger le", "Corriger le ")).toBe(
      "bug de pagination"
    );
    expect(advanceSuggestion(ghost, "Corriger le", "Corriger le bug")).toBe(
      " de pagination"
    );
  });

  it("rend la chaîne vide quand il a été tapé en entier", () => {
    expect(
      advanceSuggestion(ghost, "Corriger le", "Corriger le bug de pagination")
    ).toBe("");
  });

  it("rend null dès que la frappe s'en écarte", () => {
    expect(advanceSuggestion(ghost, "Corriger le", "Corriger le crash")).toBeNull();
    // Un retour arrière n'étend pas le préfixe : le fantôme est faux.
    expect(advanceSuggestion(ghost, "Corriger le", "Corriger l")).toBeNull();
  });

  it("survit à une frappe qui ne change rien (mouvement de caret)", () => {
    expect(advanceSuggestion(ghost, "Corriger le", "Corriger le")).toBe(ghost);
  });
});

describe("isDismissed", () => {
  const at = "Corriger le bug";

  it("tient le silence le temps de finir son idée, puis rend la main", () => {
    expect(isDismissed(at, at)).toBe(true);
    expect(isDismissed(at, `${at} de p`)).toBe(true);
    expect(isDismissed(at, at + "x".repeat(DISMISS_GRACE_CHARS))).toBe(false);
  });

  it("s'annule si on efface (le préfixe n'étend plus celui de l'Échap)", () => {
    expect(isDismissed(at, "Corriger le")).toBe(false);
    expect(isDismissed(null, at)).toBe(false);
  });
});

describe("windowPrefix", () => {
  it("ne garde que la fin d'une longue description", () => {
    const long = "a".repeat(3000) + "FIN";
    expect(windowPrefix(long).endsWith("FIN")).toBe(true);
    expect(windowPrefix(long).length).toBeLessThanOrEqual(1200);
    expect(windowPrefix("court")).toBe("court");
  });
});

describe("sanitizeCompletion", () => {
  it("rend une chaîne concaténable telle quelle au préfixe", () => {
    // Milieu de mot : le modèle répète le mot entamé (c'est le protocole du
    // prompt), on le retire, et rien ne se pose entre les deux.
    expect(
      sanitizeCompletion("pagination du board", "Corriger le bug de pag", "title")
    ).toBe("ination du board");
    // Mot entier sans espace final : c'est nous qui posons l'espace.
    expect(sanitizeCompletion("de pagination", "Corriger le bug", "title")).toBe(
      " de pagination"
    );
    // Espace déjà tapé : la suggestion n'en rajoute pas un second.
    expect(sanitizeCompletion(" de pagination", "Corriger le bug ", "title")).toBe(
      "de pagination"
    );
  });

  it("retire le préfixe que le modèle a recopié avant de continuer", () => {
    expect(
      sanitizeCompletion("Corriger le bug de pagination", "Corriger le bug", "title")
    ).toBe(" de pagination");
    // Recopie PARTIELLE — le cas qui produisait « pagpagination ».
    expect(sanitizeCompletion("de pagination", "Corriger le bug de", "title")).toBe(
      " pagination"
    );
  });

  it("jette le bavardage : guillemets, lignes en trop, point final de titre", () => {
    expect(sanitizeCompletion('"de pagination"', "Corriger le bug", "title")).toBe(
      " de pagination"
    );
    expect(
      sanitizeCompletion("de pagination\nOn pourrait aussi…", "Corriger le bug", "title")
    ).toBe(" de pagination");
    expect(sanitizeCompletion("de pagination.", "Corriger le bug", "title")).toBe(
      " de pagination"
    );
  });

  it("rend une chaîne vide quand il n'y a rien à dire", () => {
    expect(sanitizeCompletion("", "Corriger le bug", "title")).toBe("");
    expect(sanitizeCompletion("   ", "Corriger le bug", "title")).toBe("");
    expect(sanitizeCompletion('""', "Corriger le bug", "title")).toBe("");
    // Le modèle n'a fait que recopier : il n'ajoute rien.
    expect(sanitizeCompletion("Corriger le bug", "Corriger le bug", "title")).toBe("");
  });

  it("coupe à un mot, jamais au milieu", () => {
    const long = Array(40).fill("mot").join(" ");
    const out = sanitizeCompletion(long, "Corriger le bug", "title");
    expect(out.length).toBeLessThanOrEqual(MAX_COMPLETION_CHARS.title);
    expect(out.endsWith("mot")).toBe(true);
  });
});

describe("buildCompletionPrompt", () => {
  it("donne au modèle le style de la maison, et l'autorise à se taire", () => {
    const prompt = buildCompletionPrompt("title", {
      projectName: "minddy",
      recentTitles: ["Corriger le tri du board", "Ajouter les cycles"],
      locale: "fr",
    });
    expect(prompt).toContain("minddy");
    expect(prompt).toContain("Corriger le tri du board");
    expect(prompt).toContain("French");
    expect(prompt).toMatch(/output NOTHING/i);
  });

  it("passe le titre en cours au champ description, jamais l'inverse", () => {
    const desc = buildCompletionPrompt("description", {
      projectName: "minddy",
      recentTitles: [],
      title: "Corriger le bug de pagination",
      categories: ["Bug"],
      locale: "en",
    });
    expect(desc).toContain("Corriger le bug de pagination");
    expect(desc).toContain("Bug");

    const title = buildCompletionPrompt("title", {
      projectName: "minddy",
      recentTitles: [],
      locale: "en",
    });
    expect(title).not.toContain("Title of the issue being written");
  });
});
