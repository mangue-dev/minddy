import { describe, expect, it } from "vitest";

import {
  desktopWindowMaterial,
  isDesktopWindowMaterialState,
  parseWindowMaterialFlag,
  parseWindowMaterialPreference,
  windowMaterialFlag,
  windowMaterialForWindow,
  windowMaterialOptions,
} from "./window-material";

const on = { enabled: true, reducedTransparency: false };

describe("desktopWindowMaterial", () => {
  it("paints vibrancy on macOS and Acrylic from Windows 11 22H2", () => {
    expect(desktopWindowMaterial("darwin", "25.0.0", on).kind).toBe("vibrancy");
    expect(desktopWindowMaterial("win32", "10.0.22621", on).kind).toBe("acrylic");
    expect(desktopWindowMaterial("win32", "10.0.26100", on).kind).toBe("acrylic");
  });

  it("keeps the opaque window and hides the option where no blur exists", () => {
    for (const [platform, release] of [["win32", "10.0.19045"], ["win32", "10.0.22000"], ["win32", "garbage"], ["linux", "6.8.0"]] as const) {
      expect(desktopWindowMaterial(platform, release, on)).toEqual({
        supported: false, enabled: true, reducedTransparency: false, kind: "none",
      });
    }
  });

  it("turns the material off for the preference and for the system setting", () => {
    expect(desktopWindowMaterial("darwin", "25.0.0", { enabled: false, reducedTransparency: false }))
      .toEqual({ supported: true, enabled: false, reducedTransparency: false, kind: "none" });
    expect(desktopWindowMaterial("win32", "10.0.22631", { enabled: true, reducedTransparency: true }))
      .toEqual({ supported: true, enabled: true, reducedTransparency: true, kind: "none" });
  });
});

describe("windowMaterialOptions", () => {
  it("makes the window transparent only over a material", () => {
    expect(windowMaterialOptions("vibrancy")).toEqual({
      backgroundColor: "#00000000", vibrancy: "sidebar", visualEffectState: "followWindow",
    });
    expect(windowMaterialOptions("acrylic")).toEqual({ backgroundColor: "#00000000", backgroundMaterial: "acrylic" });
    expect(windowMaterialOptions("none")).toEqual({ backgroundColor: "#000000" });
  });
});

describe("window material preference and flag", () => {
  it("keeps the effect unless the file explicitly turns it off", () => {
    expect(parseWindowMaterialPreference({ enabled: false })).toBe(false);
    expect(parseWindowMaterialPreference({ enabled: true })).toBe(true);
    expect(parseWindowMaterialPreference({ enabled: "no" })).toBe(true);
    expect(parseWindowMaterialPreference(null)).toBe(true);
  });

  it("round-trips the state through the renderer command line", () => {
    const state = desktopWindowMaterial("win32", "10.0.22631", { enabled: true, reducedTransparency: true });
    expect(parseWindowMaterialFlag(["--other", windowMaterialFlag(state)])).toEqual(state);
    expect(parseWindowMaterialFlag(["--minddy-window-material=blur:111"])).toBeNull();
    expect(parseWindowMaterialFlag([])).toBeNull();
  });

  it("rejects a malformed state from IPC", () => {
    expect(isDesktopWindowMaterialState({ supported: true, enabled: true, reducedTransparency: false, kind: "vibrancy" })).toBe(true);
    expect(isDesktopWindowMaterialState({ supported: true, enabled: true, reducedTransparency: false, kind: "mica" })).toBe(false);
    expect(isDesktopWindowMaterialState("vibrancy")).toBe(false);
  });
});

describe("windowMaterialForWindow", () => {
  it("keeps a full-screen window opaque and gives the material back once windowed", () => {
    const state = desktopWindowMaterial("darwin", "25.0.0", on);
    expect(windowMaterialForWindow(state, true)).toEqual({ ...state, kind: "none" });
    expect(windowMaterialForWindow(state, false)).toBe(state);
    const off = desktopWindowMaterial("darwin", "25.0.0", { enabled: false, reducedTransparency: false });
    expect(windowMaterialForWindow(off, true)).toBe(off);
  });
});
