import { describe, expect, it } from "vitest";

import {
  cloneArguments,
  cloneNeeded,
  evaluatePrerequisite,
  folderAcceptable,
  launcherSupportsPrepareOnly,
  installerCommand,
  lastOutputLine,
  loginShellPathProbe,
  nodeVersionSupported,
  withAdminEmail,
  withConfigOverrides,
} from "./local-installer";

describe("local installer prerequisites", () => {
  it("accepts Node.js 24.22.1 and later 24.x only", () => {
    expect(nodeVersionSupported("24.22.1")).toBe(true);
    expect(nodeVersionSupported("24.30.0")).toBe(true);
    expect(nodeVersionSupported("24.22.0")).toBe(false);
    expect(nodeVersionSupported("22.12.0")).toBe(false);
    expect(nodeVersionSupported("25.0.0")).toBe(false);
  });

  it("tells a missing tool, an old Node.js and a stopped Docker daemon apart", () => {
    expect(evaluatePrerequisite("git", { ok: false, stdout: "" })).toEqual({ id: "git", state: "missing" });
    expect(evaluatePrerequisite("node", { ok: true, stdout: "v22.12.0\n" })).toEqual({
      id: "node",
      state: "outdated",
      version: "22.12.0",
    });
    expect(evaluatePrerequisite("node", { ok: true, stdout: "v24.22.1" }).state).toBe("ready");
    expect(
      evaluatePrerequisite("docker", { ok: true, stdout: "Docker version 28.1.1, build 4eba377" }, { ok: false, stdout: "" }),
    ).toEqual({ id: "docker", state: "stopped", version: "28.1.1" });
    expect(evaluatePrerequisite("docker", { ok: true, stdout: "Docker version 28.1.1" }, { ok: true, stdout: "28.1.1" }).state).toBe("ready");
  });


});

describe("local installer steps", () => {
  it("clones into an absent or empty folder, resumes a clone, and never writes into other files", () => {
    expect(cloneNeeded("absent")).toBe(true);
    expect(cloneNeeded("empty")).toBe(true);
    expect(cloneNeeded("minddy")).toBe(false);
    expect(folderAcceptable("minddy")).toBe(true);
    // A clone the person made is theirs: open it as an existing installation.
    expect(folderAcceptable("installation")).toBe(false);
    expect(folderAcceptable("occupied")).toBe(false);
  });

  it("clones the pinned release tag shallowly into the chosen folder", () => {
    const args = cloneArguments("v0.20.1", "/Users/someone/minddy");
    expect(args.slice(0, 2)).toEqual(["git", "clone"]);
    expect(args).toEqual(expect.arrayContaining(["--depth", "1", "--branch", "v0.20.1"]));
    expect(args.at(-1)).toBe("/Users/someone/minddy");
  });

  it("adapts to a cloned release that predates its newer steps", () => {
    expect(launcherSupportsPrepareOnly('} else if (arg === "--prepare-only") {')).toBe(true);
    expect(launcherSupportsPrepareOnly('} else if (arg === "--keep-backend") {')).toBe(false);
  });


  it("records the instance's administrator once", () => {
    expect(withAdminEmail("", "owner@local.minddy.app")).toBe("ADMIN_EMAILS=owner@local.minddy.app\n");
    expect(withAdminEmail("A=1\nADMIN_EMAILS=old@example.com\nB=2\n", " owner@local.minddy.app ")).toBe(
      "A=1\nADMIN_EMAILS=owner@local.minddy.app\nB=2\n",
    );
  });
});

describe("instance variables from the admin dashboard (MIN-847)", () => {
  it("turns the overrides on for the instance it installs", () => {
    expect(withConfigOverrides("ADMIN_EMAILS=owner@local.minddy.app\n")).toBe(
      "ADMIN_EMAILS=owner@local.minddy.app\nMINDDY_CONFIG_OVERRIDES=1\n",
    );
  });

  it("keeps a choice already written in the file", () => {
    expect(withConfigOverrides("MINDDY_CONFIG_OVERRIDES=0\n")).toBe("MINDDY_CONFIG_OVERRIDES=0\n");
    expect(withConfigOverrides("MINDDY_CONFIG_OVERRIDES=\n")).toBe("MINDDY_CONFIG_OVERRIDES=1\n");
  });
});

describe("local installer processes", () => {
  it("asks the login shell for PATH on macOS and Linux only", () => {
    expect(loginShellPathProbe("darwin")).toEqual({ command: "/bin/zsh", args: ["-lc", 'printf "%s" "$PATH"'] });
    expect(loginShellPathProbe("linux", "/usr/bin/fish")?.command).toBe("/usr/bin/fish");
    expect(loginShellPathProbe("win32")).toBeNull();
  });

  it("runs tools directly on POSIX and quotes them for cmd.exe on Windows", () => {
    expect(installerCommand("darwin", ["git", "clone", "/Users/some one/minddy"])).toEqual({
      command: "git",
      args: ["clone", "/Users/some one/minddy"],
    });
    const windows = installerCommand("win32", ["git", "clone", "C:\\Users\\some one\\minddy"]);
    expect(windows.command).toBe("cmd.exe");
    expect(windows.windowsVerbatimArguments).toBe(true);
    expect(windows.args.at(-1)).toBe('"git clone "C:\\Users\\some one\\minddy""');
  });

  it("refuses on Windows an argument cmd.exe would still interpret", () => {
    for (const folder of ["C:\\Users\\%USERPROFILE%\\minddy", 'C:\\a"&calc&"', "C:\\Users\\wow!\\minddy"]) {
      expect(() => installerCommand("win32", ["git", "clone", folder])).toThrow(/cannot be used on Windows/);
    }
    // POSIX runs without a shell: the same names are plain arguments.
    expect(installerCommand("linux", ["git", "clone", "/tmp/50%!"]).args.at(-1)).toBe("/tmp/50%!");
  });

  it("keeps the last readable output line, without colours and bounded", () => {
    expect(lastOutputLine("first\n\u001b[32mProgress: resolved 10\u001b[39m\n\n")).toBe("Progress: resolved 10");
    expect(lastOutputLine("\n  \n")).toBeUndefined();
    expect(lastOutputLine("x".repeat(400), 20)).toHaveLength(20);
  });
});
