import { describe, expect, it } from "vitest";
import { hideWindowStep, windowCloseAction } from "./hide-window";

describe("hideWindowStep", () => {
  it("hides a windowed window directly", () => {
    expect(hideWindowStep({ platform: "darwin", fullScreen: false })).toBe("hide");
  });

  it("leaves full screen before hiding on macOS", () => {
    // Hiding here would leave an empty black Space in the foreground, with no
    // window available to leave it.
    expect(hideWindowStep({ platform: "darwin", fullScreen: true })).toBe(
      "leave-full-screen"
    );
  });

  it("does not make the full-screen round trip outside macOS", () => {
    // There is no Space to leave; the extra transition would only flash.
    for (const platform of ["win32", "linux"]) {
      expect(hideWindowStep({ platform, fullScreen: true })).toBe("hide");
    }
  });
});

describe("windowCloseAction", () => {
  it("keeps ordinary close requests mapped to hiding the window", () => {
    expect(windowCloseAction(false)).toBe("hide");
  });

  it("lets the updater close the window so Electron can relaunch", () => {
    expect(windowCloseAction(true)).toBe("close");
  });
});
