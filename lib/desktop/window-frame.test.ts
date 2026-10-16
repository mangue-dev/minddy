import { describe, expect, it } from "vitest";

import {
  desktopWindowFrameOptions,
  desktopTitleBarOverlay,
  MACOS_TRAFFIC_LIGHT_POSITION,
  desktopDocumentChrome,
  parseRememberedWindowChrome,
  rememberableWindowChrome,
  startupIntegratedChrome,
  windowChromeReplacement,
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

describe("remembered window chrome", () => {
  const origin = "https://minddy.example.test";
  const integrated = { origin, integrated: true };

  it.each(["win32", "linux"] as const)(
    "creates the first %s window with the frame the same origin last asked for",
    (platform) => {
      expect(startupIntegratedChrome(platform, integrated, origin)).toBe(true);
      expect(startupIntegratedChrome(platform, integrated, `${origin}/`)).toBe(true);
      expect(startupIntegratedChrome(platform, { origin, integrated: false }, origin)).toBe(false);
    },
  );

  it.each(["win32", "linux"] as const)("starts native on %s without an observation of this origin", (platform) => {
    expect(startupIntegratedChrome(platform, null, origin)).toBe(false);
    expect(startupIntegratedChrome(platform, integrated, "https://other.example.test")).toBe(false);
    expect(startupIntegratedChrome(platform, integrated, "http://127.0.0.1:3000")).toBe(false);
  });

  it("leaves the single macOS frame unchanged", () => {
    expect(startupIntegratedChrome("darwin", integrated, origin)).toBe(false);
  });

  it("forgets malformed or foreign data read from disk", () => {
    expect(parseRememberedWindowChrome({ origin: `${origin}/home`, integrated: true })).toEqual(integrated);
    for (const raw of [null, "text", [], { origin }, { integrated: true }, { origin: "not a url", integrated: true },
      { origin, integrated: "1" }]) {
      expect(parseRememberedWindowChrome(raw)).toBeNull();
    }
  });

  it("remembers only a successful main document from the selected origin", () => {
    const response = {
      url: `${origin}/home`, resourceType: "mainFrame", statusCode: 200,
      responseHeaders: { "x-minddy-desktop-chrome": ["1"] },
    };
    expect(rememberableWindowChrome(response, origin)).toEqual(integrated);
    expect(rememberableWindowChrome({ ...response, responseHeaders: {} }, origin)).toEqual({ origin, integrated: false });
    expect(rememberableWindowChrome({ ...response, statusCode: 503, responseHeaders: {} }, origin)).toBeNull();
    expect(rememberableWindowChrome({ ...response, statusCode: 302 }, origin)).toBeNull();
    expect(rememberableWindowChrome({ ...response, resourceType: "subFrame" }, origin)).toBeNull();
    expect(rememberableWindowChrome({ ...response, url: "https://other.example.test/home" }, origin)).toBeNull();
  });

  it("still replaces a window whose document disagrees with the remembered frame", () => {
    // A rolled-back server stops advertising the header: back to native.
    expect(windowChromeReplacement(false, true)).toBe(false);
    expect(windowChromeReplacement(true, false)).toBe(true);
    expect(windowChromeReplacement(true, true)).toBeNull();
    expect(windowChromeReplacement(undefined, true)).toBeNull();
  });
});
