import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "../..");

/**
 * Every file of the Electron shell, with the `lib/desktop/` modules that hold
 * its decisions. Vitest never collects `desktop/src/`, so a shell file is only
 * tested through those modules: declaring a new file here is the moment to
 * say which ones they are.
 */
const SHELL_FILES: Record<string, string> = {
  "main.ts": "creates the window and answers the bridge; channels and sender policies live in @/lib/desktop/ipc-contract",
  "preload.ts": "builds the bridge of @/lib/desktop/bridge from @/lib/desktop/ipc-renderer and @/lib/desktop/launch-state",
  "menu.ts": "composes the native menu from Electron APIs",
  "open-external.ts":
    "contains native browser-launch failures; URL admission lives in @/lib/desktop/nav-guard, with rejected-launch " +
    "regressions in @/lib/desktop/open-external.test",
  "microphone-access.ts":
    "settles macOS permission requests and Settings failures; admission lives in @/lib/desktop/media-guard, with " +
    "native callback regressions in @/lib/desktop/microphone-access.test",
  "updater.ts":
    "wires electron-updater; decisions live in @/lib/desktop/update-status, @/lib/desktop/update-prompt and " +
    "@/lib/desktop/update-platform",
  "updater-module.ts": "loads electron-updater on first use; load timing regressions live in @/lib/desktop/updater.test",
  "hide-window.ts": "wires the steps of @/lib/desktop/hide-window",
  "edit-context-menu.ts": "pops up the native edit menu; which items show lives in @/lib/desktop/edit-context-menu",
  "channel-store.ts": "rewrites a retired preview channel file to stable; the decision lives in @/lib/desktop/channel",
  "push-installation-store.ts": "reads and writes the push identity; validation lives in @/lib/desktop/push-installation",
  "server-store.ts": "reads and writes the selected server; validation lives in @/lib/desktop/server-origin",
  "window-chrome-store.ts":
    "reads and writes the last observed window frame; parsing and the startup decision live in @/lib/desktop/window-frame",
  "window-material-store.ts":
    "reads and writes the window material preference; parsing and the platform decision live in " +
    "@/lib/desktop/window-material",
  "server-choice.ts":
    "serves the bundled self-hosting page and answers its channels; the trusted document lives in " +
    "@/lib/desktop/server-choice, with regressions in @/lib/desktop/server-choice-ipc.test",
  "local-account.ts":
    "creates and signs in the local instance's owner, keeping the password in safeStorage; parsing and the trust " +
    "rule live in @/lib/desktop/local-account",
  "local-toolchain.ts":
    "downloads, verifies and runs the installers of missing tools; plans, URLs, checksums and scripts live in " +
    "@/lib/desktop/local-toolchain",
  "local-installer.ts":
    "runs the local installation's commands and folder dialog; probes, steps and parsing live in " +
    "@/lib/desktop/local-installer",
  "local-runtime.ts":
    "starts the local self-host launcher and waits for health; its lifecycle lives in " +
    "@/lib/desktop/local-runtime-lifecycle and @/lib/desktop/local-runtime-platform",
  "shell-font.ts": "reads and caches the bundled font; path selection and encoding live in @/lib/desktop/shell-font",
  "trace.ts": "writes one log line without making a decision",
};

describe("the desktop/src shell", () => {
  it("declares exactly the files it contains", () => {
    const files = readdirSync(path.join(REPO, "desktop/src")).filter((file) => file.endsWith(".ts")).sort();
    expect(files, "declare each desktop/src file and the lib/desktop modules that decide for it").toEqual(
      Object.keys(SHELL_FILES).sort(),
    );
  });

  it("names decision modules that exist", () => {
    const missing = Object.values(SHELL_FILES)
      .flatMap((role) => [...role.matchAll(/@\/lib\/desktop\/([\w.-]+)/g)].map((match) => match[1]))
      .filter((name) => !existsSync(path.join(REPO, "lib/desktop", `${name}.ts`)));
    expect(missing).toEqual([]);
  });
});
