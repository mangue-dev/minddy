import { describe, expect, it } from "vitest";

import {
  localRuntimeProcessSpec,
  localRuntimeStopSpec,
} from "./local-runtime-platform";

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
