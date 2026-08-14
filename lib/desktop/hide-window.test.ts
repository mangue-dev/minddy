import { describe, expect, it } from "vitest";
import { hideWindowStep } from "./hide-window";

describe("hideWindowStep", () => {
  it("cache directement une fenêtre fenêtrée", () => {
    expect(hideWindowStep({ platform: "darwin", fullScreen: false })).toBe("hide");
  });

  it("sort du plein écran avant de cacher, sur macOS", () => {
    // Le bug : cacher ici laisse un Space vide et noir au premier plan, sans
    // rien dedans pour en sortir.
    expect(hideWindowStep({ platform: "darwin", fullScreen: true })).toBe(
      "leave-full-screen"
    );
  });

  it("ne fait pas l'aller-retour ailleurs que sur macOS", () => {
    // Pas de Space : le plein écran y est une fenêtre comme une autre, et la
    // sortie ne ferait que clignoter.
    for (const platform of ["win32", "linux"]) {
      expect(hideWindowStep({ platform, fullScreen: true })).toBe("hide");
    }
  });
});
