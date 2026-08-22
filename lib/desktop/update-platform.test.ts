import { describe, expect, it } from "vitest";

import {
  manualDesktopUpdateMessage,
  supportsAutomaticDesktopUpdates,
} from "./update-platform";

describe("supportsAutomaticDesktopUpdates", () => {
  it("keeps the macOS updater enabled", () => {
    expect(supportsAutomaticDesktopUpdates({ platform: "darwin" })).toBe(true);
  });

  it("enables Linux updates only for a real AppImage launch", () => {
    expect(
      supportsAutomaticDesktopUpdates({ platform: "linux", appImagePath: "/opt/minddy.AppImage" })
    ).toBe(true);
    expect(supportsAutomaticDesktopUpdates({ platform: "linux" })).toBe(false);
    expect(supportsAutomaticDesktopUpdates({ platform: "linux", appImagePath: "   " })).toBe(false);
  });

  it("does not claim update support for unrelated platforms", () => {
    expect(supportsAutomaticDesktopUpdates({ platform: "win32" })).toBe(false);
  });
});

describe("manualDesktopUpdateMessage", () => {
  it("explains the verified manual path for distro packages", () => {
    expect(manualDesktopUpdateMessage("linux")).toContain("GPG-verified");
    expect(manualDesktopUpdateMessage("darwin")).toBeNull();
  });
});
