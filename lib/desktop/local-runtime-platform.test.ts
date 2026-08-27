import { describe, expect, it } from "vitest";

import {
  localRuntimeProcessSpec,
  localRuntimeStartupState,
  localRuntimeStopSpec,
} from "./local-runtime-platform";

describe("localRuntimeStartupState", () => {
  it("starts an unavailable local server", () => {
    expect(localRuntimeStartupState(false, false)).toBe("start");
  });

  it("reuses a healthy server owned by this desktop process", () => {
    expect(localRuntimeStartupState(true, true)).toBe("ready");
  });

  it("refuses a healthy server owned outside the desktop app", () => {
    expect(localRuntimeStartupState(true, false)).toBe("external");
  });
});

describe("localRuntimeProcessSpec", () => {
  it("uses a hidden Windows command shell for the pnpm launcher", () => {
    expect(localRuntimeProcessSpec("win32")).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm self-host:local -- --no-open"],
      windowsHide: true,
    });
  });

  it("exec-replaces the launcher on POSIX systems", () => {
    expect(localRuntimeProcessSpec("darwin")).toEqual({
      command: "/bin/zsh",
      args: ["-lc", "exec pnpm self-host:local -- --no-open"],
    });
    expect(localRuntimeProcessSpec("linux", "/usr/bin/fish").command).toBe("/usr/bin/fish");
  });
});

describe("localRuntimeStopSpec", () => {
  it("terminates the complete Windows process tree", () => {
    expect(localRuntimeStopSpec("win32", 417)).toEqual({
      command: "taskkill.exe",
      args: ["/pid", "417", "/t", "/f"],
      windowsHide: true,
    });
  });

  it("leaves POSIX shutdown to SIGTERM", () => {
    expect(localRuntimeStopSpec("darwin", 417)).toBeNull();
    expect(localRuntimeStopSpec("linux", 417)).toBeNull();
  });
});
