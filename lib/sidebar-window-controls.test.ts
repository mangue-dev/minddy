import { describe, expect, it } from "vitest";

import {
  isMacWindowControlsZone,
  TITLEBAR_HEIGHT,
  WINDOW_BUTTONS_WIDTH,
} from "./sidebar-window-controls";

describe("primary sidebar macOS window controls", () => {
  it("keeps the rail open throughout the native-control visibility transition", () => {
    expect(
      isMacWindowControlsZone("darwin", {
        clientX: WINDOW_BUTTONS_WIDTH,
        clientY: TITLEBAR_HEIGHT,
      }),
    ).toBe(true);
  });

  it("does not reserve the corner in a browser or on another desktop platform", () => {
    const point = { clientX: 24, clientY: 24 };

    expect(isMacWindowControlsZone(undefined, point)).toBe(false);
    expect(isMacWindowControlsZone("win32", point)).toBe(false);
  });

  it("does not retain the rail after the pointer leaves the titlebar corner", () => {
    expect(
      isMacWindowControlsZone("darwin", {
        clientX: WINDOW_BUTTONS_WIDTH + 1,
        clientY: 24,
      }),
    ).toBe(false);
    expect(
      isMacWindowControlsZone("darwin", {
        clientX: 24,
        clientY: TITLEBAR_HEIGHT + 1,
      }),
    ).toBe(false);
  });
});
