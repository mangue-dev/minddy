import { describe, expect, it } from "vitest";

import {
  desktopWindowFrameOptions,
  desktopTitleBarOverlay,
  MACOS_TRAFFIC_LIGHT_POSITION,
  desktopDocumentChrome,
} from "./window-frame";

describe("desktopWindowFrameOptions", () => {
  it("keeps the custom title bar and integrated traffic lights on macOS", () => {
    expect(desktopWindowFrameOptions("darwin")).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    });
  });

  it.each(["win32", "linux"] as const)(
    "integrates native caption controls and preserves the auto-hidden menu bar on %s",
    (platform) => {
      expect(desktopWindowFrameOptions(platform, true)).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: { color: platform === "win32" ? "#00000000" : "#191a1b", symbolColor: "#eeeeee", height: 44 },
        autoHideMenuBar: true,
      });
    }
  );
  it.each(["win32", "linux"] as const)("keeps the native frame for an older renderer on %s", (platform) => {
    expect(desktopWindowFrameOptions(platform)).toEqual({ autoHideMenuBar: true });
  });
  it("negotiates only a final main document from the selected origin", () => {
    const origin = "https://minddy.example.test";
    const response = { url: `${origin}/home`, resourceType: "mainFrame", statusCode: 200 };
    expect(desktopDocumentChrome(response, origin)).toBe(false);
    expect(desktopDocumentChrome({ ...response, responseHeaders: { "X-Minddy-Desktop-Chrome": ["1"] } }, origin)).toBe(true);
    expect(desktopDocumentChrome({ ...response, responseHeaders: { "x-minddy-desktop-chrome": ["2"] } }, origin)).toBe(false);
    expect(desktopDocumentChrome({ ...response, resourceType: "subFrame" }, origin)).toBeNull();
    expect(desktopDocumentChrome({ ...response, statusCode: 307 }, origin)).toBeNull();
    expect(desktopDocumentChrome({ ...response, url: "https://other.example.test" }, origin)).toBeNull();
  });
});

describe("desktopTitleBarOverlay", () => {
  it.each([
    ["light", "#222222"],
    ["dark", "#eeeeee"],
  ] as const)("reveals the app surface on Windows with readable %s symbols", (theme, symbolColor) => {
    expect(desktopTitleBarOverlay("win32", theme)).toEqual({
      color: "#00000000",
      symbolColor,
      height: 44,
    });
  });

  it.each([
    ["light", "#fafafa", "#222222"],
    ["dark", "#191a1b", "#eeeeee"],
  ] as const)("preserves the Linux %s caption colors", (theme, color, symbolColor) => {
    expect(desktopTitleBarOverlay("linux", theme)).toEqual({ color, symbolColor, height: 44 });
  });
});
