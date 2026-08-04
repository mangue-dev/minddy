import { describe, expect, it } from "vitest";

import { cleanTitle } from "./short-title";

/**
 * Un titre de conversation se lit dans une colonne de 320 px, d'un coup d'œil.
 * La consigne système demande deux ou trois mots, mais un PETIT modèle rend
 * volontiers la phrase entière — `cleanTitle` est le garde-fou de ce cas-là.
 *
 * Ce qu'il produit alors n'est PAS le bon titre : il coupe, il ne réécrit pas.
 * « Migration de la base vers le nouveau schéma MCP » se titre « Migration MCP »,
 * et c'est le modèle qui doit le savoir (le prompt porte l'exemple) ; ici, on
 * épingle seulement qu'un titre raté reste court et lisible — jamais plus de six
 * mots, et jamais fini sur un mot qui annonce la suite.
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
    // Sans la coupe des mots-outils : « Migration de la base vers ».
    expect(cleanTitle("Migration de la base vers le nouveau schéma MCP")).toBe(
      "Migration de la base",
    );
    expect(cleanTitle("Refonte de la barre de navigation secondaire du produit")).toBe(
      "Refonte de la barre de navigation",
    );
  });

  it("garde un mot court qui porte le sujet", () => {
    // « PDF » est aussi court qu'un mot-outil, mais c'est LE sujet.
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
