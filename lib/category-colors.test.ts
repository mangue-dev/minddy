import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, pickFreeCategoryColor } from "./category-colors";

// Quickly adding a category from a picker does not require a color:
// it is this function which chooses one, and all the readability of the labels
// of a project ensures that it does not transplant a color already taken.
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
    // A hand-recolored category outside of the palette should not shrink the
    // choice — it doesn't correspond to anything.
    const color = pickFreeCategoryColor(["#123456"]);
    expect(CATEGORY_COLORS).toContain(color);
  });

  it("pioche dans la palette entière sur un projet neuf", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickFreeCategoryColor([]));
    // Random draw: 300 tests on 10 colors, all must come out.
    expect(seen.size).toBe(CATEGORY_COLORS.length);
  });
});
