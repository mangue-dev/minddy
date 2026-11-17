import { describe, expect, it } from "vitest";
import { foldedCommandFilter } from "./command-filter";
import { foldSearchText, includesFolded } from "./search-fold";

describe("accent-insensitive search", () => {
  it("folds case and accents", () => {
    expect(foldSearchText("Café — Crème Über")).toBe("cafe — creme uber");
  });

  it("matches either way round", () => {
    expect(includesFolded("Café menu", "cafe")).toBe(true);
    expect(includesFolded("Cafe menu", "café")).toBe(true);
    expect(includesFolded("Señal", "senal")).toBe(true);
    expect(includesFolded("Done", "cafe")).toBe(false);
  });

  it("scores cmdk rows without accents", () => {
    expect(foldedCommandFilter("Café", "cafe")).toBeGreaterThan(0);
    expect(foldedCommandFilter("Backlog", "cafe", ["Crème"])).toBe(0);
    expect(foldedCommandFilter("Backlog", "creme", ["Crème"])).toBeGreaterThan(0);
  });
});
