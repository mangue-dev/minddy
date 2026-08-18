import { describe, expect, it } from "vitest";

import { cleanTitle } from "./short-title";

/**
 * A conversation title is read in a 320 px column, at a glance.
 * The system instruction requires two or three words, but a SMALL model happily renders
 * the entire sentence — `cleanTitle` is the safeguard in this case.
 *
 * What it then produces is NOT the right title: it cuts, it does not rewrite.
 * "Migration of the base towards the new MCP schema" is titled "MCP Migration",
 * and it is the model which must know this (the prompt carries the example); here, on
 * only points out that a failed title remains short and readable — never more than six
 * words, and never ends on a word that announces the sequel.
 */
describe("cleanTitle", () => {
  it("laisse intact un titre déjà court", () => {
    expect(cleanTitle("Flickering agents sidebar")).toBe("Flickering agents sidebar");
    expect(cleanTitle("Refonte de la barre latérale")).toBe("Refonte de la barre latérale");
  });

  it("retire l'habillage des petits modèles", () => {
    expect(cleanTitle('"Sprint planning"')).toBe("Sprint planning");
    expect(cleanTitle("Titre : Export CSV")).toBe("Export CSV");
    expect(cleanTitle("Export CSV.")).toBe("Export CSV");
    expect(cleanTitle("  Export   CSV  ")).toBe("Export CSV");
  });

  it("plafonne à six mots", () => {
    const title = cleanTitle(
      "Fix the agents sidebar that flickers on mobile when a run finishes",
    );
    expect(title).toBe("Fix the agents sidebar that flickers");
    expect(title?.split(" ")).toHaveLength(6);
  });

  it("ne finit pas sur un mot-outil quand il coupe", () => {
    // Without cutting the tool words: “Migration from the base to”.
    expect(cleanTitle("Migration de la base vers le nouveau schéma MCP")).toBe(
      "Migration de la base",
    );
    expect(cleanTitle("Refonte de la barre de navigation secondaire du produit")).toBe(
      "Refonte de la barre de navigation",
    );
  });

  it("garde un mot court qui porte le sujet", () => {
    // “PDF” is as short as a tool word, but it’s THE subject.
    expect(cleanTitle("Ajout du support de l'export PDF dans les rapports")).toBe(
      "Ajout du support de l'export PDF",
    );
  });

  it("borne aussi les six mots à rallonge", () => {
    const title = cleanTitle(
      "Anticonstitutionnellement compliqué déploiement multirégional supplémentaire aujourd'hui",
    );
    expect(title!.length).toBeLessThanOrEqual(60);
  });

  it("rend null quand il ne reste rien", () => {
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle('"..."')).toBeNull();
  });
});
