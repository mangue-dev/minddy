import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MIN-362 — THE DESKTOP SURFACE TEST MATRIX, executable.
 *
 * `vitest.config.ts` only COLLECTS `lib/**` and oxlint plugin tests: neither
 * `app/api/**` nor `desktop/src/**` is exercised directly. Sensitive desktop
 * bridges and server-runner admission therefore need explicit coverage from
 * the collected test graph.
 *
 * Extending `include` to the application surfaces would be the obvious move, but
 * it would be wrong: the suite runs on bare Node in 18 seconds, and `app/**`
 * would pull React, Next, and jsdom behind it. The oxlint plugin remains pure,
 * with its tests alongside its vendored code.
 * The repository has already established the two correct answers, and this file
 * only makes them MANDATORY:
 *
 * 1. **a test of `lib/` can reach code that lives elsewhere** — by posting real
 * requests to a route, or by reading its source when the execution path
 * requests a database and a microVM
 * ([engine-wiring.test.ts](engine-wiring.test.ts) explains the doctrine);
 * 2. **the decision belongs in `lib/desktop/`**, where it has a neighboring test
 * (`hide-window.ts` / `hide-window.test.ts`), while the `desktop/src/` shell keeps
 * only the wiring: an `ipcMain.handle` that calls a pure function and returns
 * its response.
 *
 * So this file fails when someone adds a sensitive surface without its
 * test, and the failure message identifies the missing coverage. This is a
 * CULTURE safeguard, not a behavioral test; it does not replace the tests it
 * requires.
 */

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
  it("keeps the premise that Vitest collects only pure tests", () => {
    // If one day `include` expands, this file no longer has the same value — it
    // must then be reread, not bypassed.
    expect(read("vitest.config.ts")).toContain(
      'include: ["lib/**/*.test.ts", "tools/**/*.test.ts"]',
    );
  });

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
  "updater.ts": "wires electron-updater; decisions live in @/lib/desktop/update-*",
  "hide-window.ts": "wires hideWindowStep from @/lib/desktop/hide-window",
  "channel-store.ts": "reads and writes the channel file; parsing lives in @/lib/desktop/channel",
  "push-installation-store.ts":
    "reads and writes the APNs identity; validation lives in @/lib/desktop/push-installation",
  "repo-store.ts": "reads and writes attachments; parsing lives in @/lib/desktop/local-repo",
  "server-store.ts": "reads and writes the selected server; validation lives in @/lib/desktop/server-origin",
  "server-picker.ts":
    "composes the native server picker window; validation lives in @/lib/desktop/server-origin",
  "server-picker-preload.ts": "closed IPC bridge for the server picker window",
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
  });

  it("keeps desktop settings actions argument-free and diagnostic contents local", () => {
    const contract = read("lib/desktop/bridge.ts");
    expect(contract).toContain("openServerPicker?(): void;");
    expect(contract).toContain("checkForUpdates?(): Promise<void>;");
    expect(contract).toContain("copyDiagnosticReport?(): Promise<boolean>;");
    expect(contract).toContain("openWindowsStoreUpdate?(): void;");
    expect(contract).toContain("onWindowsStoreUpdateStatus?(");

    const preload = read("desktop/src/preload.ts");
    expect(preload).toContain('ipcRenderer.send("minddy:server-picker:open")');
    expect(preload).toContain('ipcRenderer.invoke("minddy:update:check")');
    expect(preload).toContain('ipcRenderer.invoke("minddy:diagnostics:copy")');
    expect(preload).toContain('ipcRenderer.send("minddy:windows-store:open")');
    expect(preload).toContain(
      'ipcRenderer.send("minddy:windows-store-update-status-ready")',
    );
    expect(preload).not.toContain("diagnosticReport");

    const main = read("desktop/src/main.ts");
    expect(main).toContain("copyDiagnosticReportWithConfirmation(mainWindow)");

    const menu = read("desktop/src/menu.ts");
    expect(menu).toContain("clipboard.writeText(diagnosticReport())");
    expect(menu).toContain('message: "Copy the diagnostic report?"');
    expect(menu).toContain("copyDiagnosticReportWithConfirmation(window)");
  });
});

/**
 * `lib/desktop/`: THE OWNER `<module>.ts` / `<module>.test.ts`.
 *
 * This is the half that makes the first half tenable. An exemption is declared here,
 * with its reason — and there are only two.
 */
const SANS_TEST = {
  "bridge.ts": "type surface plus a small guarded `getDesktopBridge`; nothing behavioral to test",
  "use-update-status.ts": "React hook; the suite runs in bare Node without jsdom",
} as const;

describe("the `lib/desktop/` modules", () => {
  it("keeps a neighboring test for every behavioral module", () => {
    const fichiers = listTs("lib/desktop");
    const modules = fichiers.filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".git.test.ts"));
    const nus = modules.filter((f) => {
      if (f in SANS_TEST) return false;
      const base = f.replace(/\.tsx?$/, "");
      return !fichiers.includes(`${base}.test.ts`) && !fichiers.includes(`${base}.git.test.ts`);
    });

    expect(
      nus.join(", "),
      "untested `lib/desktop/` module: desktop decisions belong here, following " +
        "the `hide-window.ts` / `hide-window.test.ts` pattern",
    ).toBe("");
  });

  it("keeps exemptions limited to declared modules", () => {
    const fichiers = listTs("lib/desktop");
    const fantomes = Object.keys(SANS_TEST).filter((f) => !fichiers.includes(f));
    expect(fantomes.join(", "), "exemption that no longer names a module").toBe("");
  });
});
