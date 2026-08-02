import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, pickFreeCategoryColor } from "./category-colors";

// L'ajout rapide d'une catégorie depuis un picker ne demande pas de couleur :
// c'est cette fonction qui en choisit une, et toute la lisibilité des étiquettes
// d'un projet tient à ce qu'elle ne repique pas une couleur déjà prise.
describe("pickFreeCategoryColor", () => {
  it("évite les couleurs déjà utilisées par le projet", () => {
    const used = CATEGORY_COLORS.slice(0, 9);
    for (let i = 0; i < 50; i++) {
      expect(pickFreeCategoryColor(used)).toBe(CATEGORY_COLORS[9]);
    }
  });

  it("reste dans la palette quand tout est déjà pris", () => {
    const color = pickFreeCategoryColor(CATEGORY_COLORS);
    expect(CATEGORY_COLORS).toContain(color);
  });

  it("ignore une couleur hors palette", () => {
    // Une catégorie recolorée à la main hors palette ne doit pas rétrécir le
    // choix — elle n'y correspond à rien.
    const color = pickFreeCategoryColor(["#123456"]);
    expect(CATEGORY_COLORS).toContain(color);
  });

  it("pioche dans la palette entière sur un projet neuf", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickFreeCategoryColor([]));
    // Tirage aléatoire : 300 essais sur 10 couleurs, toutes doivent sortir.
    expect(seen.size).toBe(CATEGORY_COLORS.length);
  });
});
