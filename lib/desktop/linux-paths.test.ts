import { describe, expect, it } from "vitest";

import { linuxDesktopPaths } from "./linux-paths";

describe("linuxDesktopPaths", () => {
  it("uses the XDG homes for all persistent desktop state", () => {
    expect(
      linuxDesktopPaths(
        {
          XDG_CONFIG_HOME: "/work/config",
          XDG_CACHE_HOME: "/work/cache",
          XDG_STATE_HOME: "/work/state",
        },
        "/home/minddy",
        "minddy"
      )
    ).toEqual({
      userData: "/work/config/minddy",
      cache: "/work/cache/minddy",
      logs: "/work/state/minddy/logs",
    });
  });

  it("falls back to the XDG defaults when homes are absent or invalid", () => {
    expect(
      linuxDesktopPaths(
        { XDG_CONFIG_HOME: "relative", XDG_CACHE_HOME: "", XDG_STATE_HOME: "also-relative" },
        "/home/minddy",
        "minddy"
      )
    ).toEqual({
      userData: "/home/minddy/.config/minddy",
      cache: "/home/minddy/.cache/minddy",
      logs: "/home/minddy/.local/state/minddy/logs",
    });
  });
});
