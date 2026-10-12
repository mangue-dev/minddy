import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_COLORS, pickFreeCategoryColor } from "./category-colors";

// Quickly adding a category from a picker does not require a color:
// it is this function which chooses one, and all the readability of the labels
// of a project ensures that it does not transplant a color already taken.
describe("pickFreeCategoryColor", () => {
  it("avoids colors already used by the project", () => {
    const used = CATEGORY_COLORS.slice(0, 9);
    for (let i = 0; i < 50; i++) {
      expect(pickFreeCategoryColor(used)).toBe(CATEGORY_COLORS[9]);
    }
  });

  it("stays in the palette when all colors are taken", () => {
    const color = pickFreeCategoryColor(CATEGORY_COLORS);
    expect(CATEGORY_COLORS).toContain(color);
  });

  it("ignores a color outside the palette", () => {
    // A hand-recolored category outside of the palette should not shrink the
    // choice — it doesn't correspond to anything.
    const color = pickFreeCategoryColor(["#123456"]);
    expect(CATEGORY_COLORS).toContain(color);
  });

  it("draws from the entire palette for a new project", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickFreeCategoryColor([]));
    // Random draw: 300 tests on 10 colors, all must come out.
    expect(seen.size).toBe(CATEGORY_COLORS.length);
  });
});

afterEach(() => vi.restoreAllMocks());

it("assigns different colors until the palette is exhausted, including uppercase stored colors", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const used = [CATEGORY_COLORS[0].toUpperCase()];
  for (let i = 1; i < CATEGORY_COLORS.length; i++) {
    const color = pickFreeCategoryColor(used);
    expect(used.map((entry) => entry.toLowerCase())).not.toContain(color);
    used.push(color);
  }
  expect(new Set(used.map((color) => color.toLowerCase())).size).toBe(CATEGORY_COLORS.length);
  expect(CATEGORY_COLORS).toContain(pickFreeCategoryColor(used));
});

it("uses both ends of the available color range", () => {
  const random = vi.spyOn(Math, "random");
  random.mockReturnValue(0);
  const first = pickFreeCategoryColor([CATEGORY_COLORS[0]]);
  random.mockReturnValue(0.999);
  expect(pickFreeCategoryColor([CATEGORY_COLORS[0]])).not.toBe(first);
});
