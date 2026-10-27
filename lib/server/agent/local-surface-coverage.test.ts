import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Sensitive routes and IPC bridges need explicit coverage even when their owners
// live outside lib. Presence checks complement the behavioral admission tests.

const REPO = path.resolve(__dirname, "../../..");
const read = (relative: string): string => readFileSync(path.join(REPO, relative), "utf8");
const listTs = (relative: string): string[] =>
  readdirSync(path.join(REPO, relative))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .sort();

/** All `lib/` test files, flat — this is where we look for evidence. */
function libTests(): Array<{ file: string; source: string }> {
  const out: Array<{ file: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith(".test.ts")) out.push({ file: relative, source: read(relative) });
    }
  };
  walk("lib");
  return out;
}

/**
 * WHAT LIVES OUTSIDE `lib/**` AND MUST STILL BE EXERCISED.
 *
 * One entry per surface, with the REASON — otherwise the list becomes an
 * inventory that can be extended without thought. `reachedBy` is the text a
 * `lib/` test must contain to prove it reaches the surface: either an import
 * path or a path read by a structural test.
 */
const SURFACES_HORS_LIB = [
  {
    file: "app/api/agent-vm/[...path]/route.ts",
    pourquoi:
      "the server-runner admission path for both managed and self-hosted sandboxes.",
    reachedBy: "@/app/api/agent-vm/[...path]/route",
  },
  {
    file: "app/api/desktop/download/route.ts",
    pourquoi: "the desktop application download, which is the repository's only served binary.",
    reachedBy: "@/app/api/desktop/download/route",
  },
  {
    file: "app/api/desktop/local-turn/route.ts",
    pourquoi:
      "the compatibility tombstone that prevents old desktop clients from claiming local work.",
    reachedBy: "@/app/api/desktop/local-turn/route",
  },
] as const;

describe("desktop and server-runner surfaces outside `lib/**`", () => {
  it("reaches every surface from a `lib/` test", () => {
    const tests = libTests();
    const orphelines = SURFACES_HORS_LIB.filter(
      (surface) => !tests.some((t) => t.source.includes(surface.reachedBy)),
    ).map((surface) => `${surface.file} — ${surface.pourquoi}`);

    expect(
      orphelines.join("\n"),
      "surface outside `lib/**` that no test reaches",
    ).toBe("");
  });
});

/**
 * THE DESKTOP SHELL, AND WHERE ITS DECISIONS LIVE.
 *
 * One more file in `desktop/src/` is a file that the test suite will never
 * see. The list below is therefore closed: adding a line to it is the
 * act by which we state WHAT that file may contain and which pure module in
 * `lib/desktop/` makes its decisions.
 */
const COQUILLE = {
  "main.ts": "assembles the window and IPC handlers; decisions live in @/lib/desktop/*",
  "preload.ts": "exposes the @/lib/desktop/bridge contract and nothing else",
  "local-run-diff.ts":
    "reads a run-owned snapshot from the desktop data directory; identifier and payload " +
    "validation live in @/lib/desktop/local-run-diff, and path layout lives in " +
    "@/lib/desktop/local-run-history and @/lib/server/agent/harness-layout",
  "menu.ts": "composes the native menu from Electron APIs",
  "open-external.ts":
    "contains native browser-launch failures; URL admission remains in @/lib/desktop/nav-guard, " +
    "with rejected-launch regressions in @/lib/desktop/open-external.test",
  "microphone-access.ts":
    "settles macOS permission requests and Settings failures; request admission remains in " +
    "@/lib/desktop/media-guard, with native callback regressions in @/lib/desktop/microphone-access.test",
  "updater.ts": "wires electron-updater; decisions live in @/lib/desktop/update-*",
  "updater-module.ts":
    "loads electron-updater on first use; load timing regressions live in @/lib/desktop/updater.test",
  "hide-window.ts": "wires hideWindowStep from @/lib/desktop/hide-window",
  "edit-context-menu.ts":
    "pops up the native edit menu on right-click; which items show lives in @/lib/desktop/edit-context-menu",
  "channel-store.ts":
    "rewrites a retired preview channel file to stable; the decision lives in @/lib/desktop/channel",
  "push-installation-store.ts":
    "reads and writes the APNs identity; validation lives in @/lib/desktop/push-installation",
  "repo-store.ts": "reads and writes attachments; parsing lives in @/lib/desktop/local-repo",
  "server-store.ts": "reads and writes the selected server; validation lives in @/lib/desktop/server-origin",
  "window-chrome-store.ts":
    "reads and writes the last observed window frame; parsing and the startup decision live in @/lib/desktop/window-frame",
  "window-material-store.ts":
    "reads and writes the device's window material preference; parsing and the platform decision live in " +
    "@/lib/desktop/window-material",
  "server-choice.ts":
    "serves the bundled self-hosting page and answers its bridge calls; the trusted document lives in " +
    "@/lib/desktop/server-choice",
  "local-account.ts":
    "creates the local instance's owner and signs it in, keeping the password in safeStorage; parsing and the " +
    "trust rule live in @/lib/desktop/local-account",
  "local-toolchain.ts":
    "downloads, verifies and runs the installers of missing tools; plans, URLs, checksums and scripts live in " +
    "@/lib/desktop/local-toolchain",
  "local-installer.ts":
    "runs the local installation's commands and folder dialog; probes, steps and parsing live in " +
    "@/lib/desktop/local-installer",
  "local-runtime.ts":
    "starts the local self-host launcher and waits for health; its contract lives in scripts/self-hosting-local.mjs",
  "local-repo.ts": "wires the system panel and storage; decisions live in @/lib/desktop/local-repo",
  "run-log.ts":
    "performs local-run log file I/O and collects the diagnostic report; naming, rotation, " +
    "headers, substitution, and report shape live in @/lib/desktop/run-log",
  "shell-font.ts":
    "reads and caches the bundled font; path selection and data URL encoding live in @/lib/desktop/shell-font",
  "trace.ts": "writes one log line without making a decision",
} as const;

describe("the `desktop/src/` shell", () => {
  it("contains only declared files whose decision owners are documented", () => {
    const inconnus = listTs("desktop/src").filter((f) => !(f in COQUILLE));
    expect(
      inconnus.join(", "),
      "undeclared `desktop/src/` file: document what it contains and move its " +
        "decisions into `lib/desktop/` with a neighboring test",
    ).toBe("");
  });

  it("keeps the bridge closed so file paths never arrive from the page", () => {
    // The rule of lib/desktop/bridge.ts, checked where it would break: the
    // preload must not accept any path, otherwise remote code
    // can designate `~/.ssh` by writing a string.
    const preload = read("desktop/src/preload.ts");
    expect(preload).not.toMatch(/\b(path|filePath|dirPath|directory)\s*:\s*string/);
    // The server choice's installer picks its folder in the native dialog
    // (MIN-781): no member names a folder either.
    expect(preload).not.toMatch(/\bfolder\s*:\s*string/);
  });

  it("keeps desktop settings actions argument-free", () => {
    const contract = read("lib/desktop/bridge.ts");
    expect(contract).toContain("openServerPicker?(): void;");
    expect(contract).toContain("checkForUpdates?(): Promise<void>;");
    expect(contract).toContain("openWindowsStoreUpdate?(): void;");
    expect(contract).toContain("onWindowsStoreUpdateStatus?(");

    const preload = read("desktop/src/preload.ts");
    expect(preload).toContain('ipcRenderer.send("minddy:server-picker:open")');
    expect(preload).toContain('ipcRenderer.invoke("minddy:update:check")');
    expect(preload).toContain('ipcRenderer.send("minddy:windows-store:open")');
    expect(preload).toContain(
      'ipcRenderer.send("minddy:windows-store-update-status-ready")',
    );
  });
});
