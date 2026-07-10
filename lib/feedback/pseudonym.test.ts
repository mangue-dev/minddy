import { describe, expect, it } from "vitest";
import { generatePseudonym } from "./pseudonym";

describe("generatePseudonym", () => {
  it("is stable for a given seed", () => {
    const seed = "1f0e8f9a-1234-4abc-9def-000000000042";
    expect(generatePseudonym(seed)).toBe(generatePseudonym(seed));
  });

  it("matches the Adjective Animal NN format", () => {
    for (let i = 0; i < 50; i++) {
      const pseudonym = generatePseudonym(`seed-${i}`);
      expect(pseudonym).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{2}$/);
      const suffix = Number(pseudonym.split(" ")[2]);
      expect(suffix).toBeGreaterThanOrEqual(10);
      expect(suffix).toBeLessThanOrEqual(99);
    }
  });

  it("varies across seeds", () => {
    const values = new Set(
      Array.from({ length: 200 }, (_, i) => generatePseudonym(`user-${i}`))
    );
    // Pas d'exigence d'unicité stricte, mais la distribution doit être large.
    expect(values.size).toBeGreaterThan(150);
  });
});
