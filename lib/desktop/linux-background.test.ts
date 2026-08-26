import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  escapeDesktopEntryExecArgument,
  isLinuxBackgroundLaunch,
  linuxBackgroundAutostartPath,
  linuxBackgroundDesktopEntry,
  linuxBackgroundExecutable,
  readLinuxBackgroundPreference,
  syncLinuxBackgroundAutostart,
  writeLinuxBackgroundPreference,
} from "./linux-background";

describe("Linux background launch", () => {
  it("recognizes only the exact background argument", () => {
    expect(isLinuxBackgroundLaunch(["minddy", "--background"])).toBe(true);
    expect(isLinuxBackgroundLaunch(["minddy", "--background=true"])).toBe(false);
    expect(isLinuxBackgroundLaunch(["minddy", "background"])).toBe(false);
  });

  it("uses APPIMAGE when it is an absolute outer executable", () => {
    expect(
      linuxBackgroundExecutable(
        { APPIMAGE: "/home/me/Apps/minddy current.AppImage" },
        "/tmp/.mount-minddy/minddy"
      )
    ).toBe("/home/me/Apps/minddy current.AppImage");
    expect(
      linuxBackgroundExecutable({ APPIMAGE: "relative.AppImage" }, "/usr/bin/minddy")
    ).toBe("/usr/bin/minddy");
  });

  it("quotes reserved Desktop Entry characters safely", () => {
    expect(escapeDesktopEntryExecArgument('/opt/100% minddy $current/`bin`/"app"'))
      .toBe('"/opt/100%% minddy \\$current/\\`bin\\`/\\"app\\""');
    expect(() => escapeDesktopEntryExecArgument("bad\npath")).toThrow(
      /control characters/
    );
  });
});

describe("Linux background autostart", () => {
  it("resolves the XDG autostart path with a specification fallback", () => {
    expect(
      linuxBackgroundAutostartPath(
        { XDG_CONFIG_HOME: "/work/config" },
        "/home/me"
      )
    ).toBe("/work/config/autostart/minddy-background.desktop");
    expect(
      linuxBackgroundAutostartPath(
        { XDG_CONFIG_HOME: "relative" },
        "/home/me"
      )
    ).toBe("/home/me/.config/autostart/minddy-background.desktop");
  });

  it("writes, refreshes, and removes the per-user entry", () => {
    const root = mkdtempSync(path.join(tmpdir(), "minddy-background-"));
    const environment = { XDG_CONFIG_HOME: path.join(root, "config") };
    const destination = linuxBackgroundAutostartPath(environment, root);
    try {
      expect(
        syncLinuxBackgroundAutostart({
          enabled: true,
          environment,
          home: root,
          execPath: "/usr/bin/minddy",
        })
      ).toBe(true);
      expect(readFileSync(destination, "utf8")).toBe(
        linuxBackgroundDesktopEntry("/usr/bin/minddy")
      );

      syncLinuxBackgroundAutostart({
        enabled: true,
        environment: { ...environment, APPIMAGE: "/apps/minddy.AppImage" },
        home: root,
        execPath: "/tmp/.mount/minddy",
      });
      expect(readFileSync(destination, "utf8")).toContain(
        'Exec="/apps/minddy.AppImage" "--background"'
      );

      expect(
        syncLinuxBackgroundAutostart({
          enabled: false,
          environment,
          home: root,
          execPath: "/usr/bin/minddy",
        })
      ).toBe(false);
      expect(() => readFileSync(destination)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists consent independently from the replaceable launcher", () => {
    const root = mkdtempSync(path.join(tmpdir(), "minddy-background-pref-"));
    try {
      expect(readLinuxBackgroundPreference(root)).toBe(false);
      writeLinuxBackgroundPreference(root, true);
      expect(readLinuxBackgroundPreference(root)).toBe(true);
      writeLinuxBackgroundPreference(root, false);
      expect(readLinuxBackgroundPreference(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
