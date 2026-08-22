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

  it("leaves every Windows update to Microsoft Store", () => {
    expect(supportsAutomaticDesktopUpdates({ platform: "win32" })).toBe(false);
  });
});

describe("manualDesktopUpdateMessage", () => {
  it("explains the verified manual path for distro packages", () => {
    expect(manualDesktopUpdateMessage("linux")).toContain("GPG-verified");
    expect(manualDesktopUpdateMessage("darwin")).toBeNull();
  });

  it("names Microsoft Store as the update owner for Store packages", () => {
    expect(manualDesktopUpdateMessage("win32")).toContain("Microsoft Store");
  });
});
