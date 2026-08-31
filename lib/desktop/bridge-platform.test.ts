import { describe, expect, it } from "vitest";

import { desktopBridgePlatform } from "./bridge";

describe("desktopBridgePlatform", () => {
  it("uses the platform exposed by current desktop shells", () => {
    expect(desktopBridgePlatform({ platform: "darwin" }, "Win32")).toBe(
      "darwin",
    );
    expect(desktopBridgePlatform({ platform: "win32" }, "MacIntel")).toBe(
      "win32",
    );
  });

  it.each([
    ["MacIntel", "darwin"],
    ["Win32", "win32"],
    ["Linux x86_64", "linux"],
  ] as const)(
    "infers %s for a legacy shell without an exposed platform",
    (browserPlatform, expected) => {
      expect(desktopBridgePlatform({}, browserPlatform)).toBe(expected);
    },
  );

  it("does not guess an unknown legacy platform", () => {
    expect(desktopBridgePlatform({}, "Unknown")).toBeNull();
  });
});
