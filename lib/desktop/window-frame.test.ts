import { describe, expect, it } from "vitest";

import {
  desktopWindowFrameOptions,
  MACOS_TRAFFIC_LIGHT_POSITION,
} from "./window-frame";

describe("desktopWindowFrameOptions", () => {
  it("keeps the custom title bar and integrated traffic lights on macOS", () => {
    expect(desktopWindowFrameOptions("darwin")).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    });
  });

  it.each(["win32", "linux"] as const)(
    "uses native window chrome and an auto-hidden menu bar on %s",
    (platform) => {
      expect(desktopWindowFrameOptions(platform)).toEqual({
        frame: true,
        autoHideMenuBar: true,
      });
    }
  );
});
