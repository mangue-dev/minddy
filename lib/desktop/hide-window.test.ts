import { describe, expect, it } from "vitest";
import { hideWindowStep } from "./hide-window";

describe("hideWindowStep", () => {
  it("cache directement une fenêtre fenêtrée", () => {
    expect(hideWindowStep({ platform: "darwin", fullScreen: false })).toBe("hide");
  });

  it("sort du plein écran avant de cacher, sur macOS", () => {
    // The bug: hiding here leaves an empty and black Space in the foreground, without
    // nothing in to get out.
    expect(hideWindowStep({ platform: "darwin", fullScreen: true })).toBe(
      "leave-full-screen"
    );
  });

  it("ne fait pas l'aller-retour ailleurs que sur macOS", () => {
    // No Space: the full screen is a window like any other, and the
    // sortie ne ferait que clignoter.
    for (const platform of ["win32", "linux"]) {
      expect(hideWindowStep({ platform, fullScreen: true })).toBe("hide");
    }
  });
});
