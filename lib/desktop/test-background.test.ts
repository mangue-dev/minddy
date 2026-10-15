import { describe, expect, it } from "vitest";
import { desktopTestBackground } from "./test-background";

describe("desktopTestBackground", () => {
  it("opens test windows in the background only when an unpackaged run asks for it", () => {
    expect(desktopTestBackground(false, { MINDDY_DESKTOP_TEST_BACKGROUND: "1" })).toBe(true);
    expect(desktopTestBackground(false, { MINDDY_DESKTOP_TEST_BACKGROUND: " 1 " })).toBe(true);
  });

  it("keeps the normal focused windows otherwise", () => {
    expect(desktopTestBackground(false, {})).toBe(false);
    expect(desktopTestBackground(false, { MINDDY_DESKTOP_TEST_BACKGROUND: "0" })).toBe(false);
    expect(desktopTestBackground(false, { MINDDY_DESKTOP_TEST_BACKGROUND: "true" })).toBe(false);
  });

  it("is ignored by a packaged app even when its environment carries the variable", () => {
    expect(desktopTestBackground(true, { MINDDY_DESKTOP_TEST_BACKGROUND: "1" })).toBe(false);
  });
});
