import { describe, expect, it } from "vitest";
import { isMarketingPath, MARKETING_PATHS } from "./window-routes";

describe("isMarketingPath", () => {
  it("refuse la landing, dans les deux langues", () => {
    expect(isMarketingPath("/")).toBe(true);
    expect(isMarketingPath("/fr")).toBe(true);
  });

  it("refuse le reste du site public", () => {
    for (const path of ["/pricing", "/fr/tarifs", "/changelog", "/mcp", "/alternatives/linear"]) {
      expect(isMarketingPath(path), path).toBe(true);
    }
  });

  it("laisse passer les pages légales — l'inscription y renvoie", () => {
    for (const path of ["/terms", "/fr/cgu", "/privacy", "/legal", "/cookies"]) {
      expect(isMarketingPath(path), path).toBe(false);
    }
  });

  it("laisse passer l'app et l'écran de connexion", () => {
    for (const path of ["/home", "/login", "/inbox", "/projects/abc", "/settings"]) {
      expect(isMarketingPath(path), path).toBe(false);
    }
  });

  it("lit aussi bien une URL complète qu'un chemin", () => {
    expect(isMarketingPath("https://www.minddy.app/fr")).toBe(true);
    expect(isMarketingPath("https://www.minddy.app/home")).toBe(false);
    expect(isMarketingPath("http://localhost:3000/")).toBe(true);
  });

  it("ignore la barre oblique finale et le reste de l'URL", () => {
    expect(isMarketingPath("/pricing/")).toBe(true);
    expect(isMarketingPath("https://www.minddy.app/pricing?utm=x")).toBe(true);
  });

  it("ne refuse rien sur une entrée illisible", () => {
    expect(isMarketingPath("pas une url")).toBe(false);
  });

  it("dérive la liste de la table des routes publiques", () => {
    // Une page publique de plus doit sortir de la fenêtre toute seule : si
    // quelqu'un recopie la liste un jour, ce compte le dira.
    expect(MARKETING_PATHS.size).toBeGreaterThanOrEqual(12);
    expect(MARKETING_PATHS.has("/")).toBe(true);
  });
});
