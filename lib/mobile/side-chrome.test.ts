// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { applySideChrome, sideChromeFor } from "./side-chrome";

describe("sideChromeFor", () => {
  it("puts the bar on the right on iPhone Duo's outer display and inner landscape", () => {
    expect(sideChromeFor({ top: 0, right: 84, bottom: 34, left: 0 })).toBe("right");
  });

  it("follows the controls to the left for an app on the left of a split", () => {
    expect(sideChromeFor({ top: 0, right: 0, bottom: 34, left: 84 })).toBe("left");
  });

  it("keeps the bottom bar when the status bar is at the top", () => {
    // iPhone Duo's inner display in portrait, and any phone in portrait.
    expect(sideChromeFor({ top: 59, right: 0, bottom: 34, left: 0 })).toBeNull();
  });

  it("keeps the bottom bar on a phone in landscape, inset on both sides", () => {
    expect(sideChromeFor({ top: 0, right: 59, bottom: 21, left: 59 })).toBeNull();
  });

  it("keeps the bottom bar without any inset", () => {
    expect(sideChromeFor({ top: 0, right: 0, bottom: 0, left: 0 })).toBeNull();
  });
});

describe("applySideChrome", () => {
  it("keeps the side the shell set while the page reads no inset at all", () => {
    // The mobile app's WebView reports its safe areas only after the first
    // paint: an early reading of zeros must not undo the shell's answer.
    document.documentElement.setAttribute("data-side-chrome", "right");
    applySideChrome(document);
    expect(document.documentElement.getAttribute("data-side-chrome")).toBe("right");
  });
});
