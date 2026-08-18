import { describe, expect, it } from "vitest";

import {
  MINDDY_NODE_EXEC_ENV,
  MINDDY_NPM_CLI_ENV,
  OPENCODE_VERSION,
  opencodeNpmProgram,
} from "@/lib/server/agent/vm/opencode-version";
import {
  OPENCODE_INSTALL_MANIFEST,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
} from "@/lib/server/agent/vm/opencode-version";
import {
  opencodeBin,
  opencodeDecision,
  opencodeInstallNote,
  opencodeRefusalMessage,
  electronToolShim,
  localRuntimePath,
  npmInvocation,
  readOpencodeManifestVersion,
} from "./opencode-install";

/**
 * MIN-293 — OPENCODE PRE-FLIGHT.
 *
 * Two things are required here. The first is the PIN: an existence test
 * alone would see yesterday's binary and find it just fine, and all rounds
 * would run on the old engine while the repository swears otherwise. The
 * second is the case that the audit had not named — **Electron embeds Node,
 * not npm**: on a Mac without a toolchain, the installation cannot take place, and this must be said BEFORE the fork, where there is still a log.
 */

const WANTED = "1.18.16";

function facts(over: Partial<Parameters<typeof opencodeDecision>[0]> = {}) {
  return {
    installedVersion: WANTED,
    pluginVersion: WANTED,
    binaryPresent: true,
    npmAvailable: true,
    ...over,
  };
}

describe("opencodeDecision", () => {
  it("does nothing when the correct version is present", () => {
    expect(opencodeDecision(facts(), WANTED)).toEqual({ action: "ready" });
  });

  it("installs on a new machine", () => {
    expect(
      opencodeDecision(facts({ installedVersion: null, binaryPresent: false }), WANTED),
    ).toEqual({ action: "install", why: "missing" });
  });

  it("REINSTALLS when the pin moved, even if the binary is present", () => {
    // The case that would be costly in silence: the depot measurement book carries
    // on THIS binary, not on a public API.
    expect(opencodeDecision(facts({ installedVersion: "1.17.0" }), WANTED)).toEqual({
      action: "install",
      why: "version",
    });
  });

  it("reinstalls when the manifest has the correct version but the binary is missing", () => {
    expect(opencodeDecision(facts({ binaryPresent: false }), WANTED)).toEqual({
      action: "install",
      why: "missing",
    });
  });

  it("installs the tool runtime once if it is missing from an old installation", () => {
    expect(opencodeDecision(facts({ pluginVersion: null }), WANTED)).toEqual({
      action: "install",
      why: "missing",
    });
  });

  it("REFUSE quand il n'y a rien à installer avec — Electron n'embarque pas npm", () => {
    expect(
      opencodeDecision(
        facts({ installedVersion: null, binaryPresent: false, npmAvailable: false }),
        WANTED,
      ),
    ).toEqual({ action: "refuse", reason: "no_npm" });
  });

  it("does NOT reject a missing npm when everything is already installed", () => {
    // A machine without a toolchain that received opencode once continues to
    // turn: the refusal concerns the installation, not the execution.
    expect(opencodeDecision(facts({ npmAvailable: false }), WANTED)).toEqual({ action: "ready" });
  });

  it("prend l'épingle du dépôt par défaut", () => {
    expect(opencodeDecision(facts({ installedVersion: OPENCODE_VERSION }))).toEqual({
      action: "ready",
    });
  });
});

describe("readOpencodeManifestVersion", () => {
  it("lit la version du paquet", () => {
    expect(readOpencodeManifestVersion('{"name":"opencode-ai","version":"1.18.16"}')).toBe(
      "1.18.16",
    );
  });

  it("returns null for a truncated, empty, or versionless manifest", () => {
    for (const raw of ['{"name":"opencode-ai"', "", "{}", '{"version":42}', '{"version":"  "}']) {
      expect(readOpencodeManifestVersion(raw)).toBeNull();
    }
  });
});

describe("les chemins et la commande", () => {
  it("repairs the minimal PATH of an app launched from Finder without losing the existing PATH", () => {
    expect(localRuntimePath("/usr/bin:/bin", ["/Users/c/.nvm/versions/node/v24/bin"]))
      .toBe(
        "/usr/bin:/bin:/Users/c/.nvm/versions/node/v24/bin:/opt/homebrew/bin:" +
          "/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin",
      );
  });

  it("fabrique des shims Node/npm qui supportent les espaces et apostrophes", () => {
    expect(electronToolShim("/Applications/Minddy's App.app/minddy", ["/app asar/npm-cli.js"]))
      .toBe(
        "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec " +
          "'/Applications/Minddy'\\''s App.app/minddy' '/app asar/npm-cli.js' \"$@\"\n",
      );
  });

  it("prefers the bundled npm and runs it with Electron's Node", () => {
    expect(
      npmInvocation({
        bundledCli: "/Applications/minddy.app/Contents/Resources/app.asar/node_modules/npm/bin/npm-cli.js",
        electronExecutable: "/Applications/minddy.app/Contents/MacOS/minddy",
        systemNpm: "/usr/local/bin/npm",
      }),
    ).toMatchObject({
      executable: "/Applications/minddy.app/Contents/MacOS/minddy",
      source: "bundled",
      extraEnv: { ELECTRON_RUN_AS_NODE: "1" },
    });
  });

  it("falls back to system npm when the old bundle does not contain one", () => {
    expect(
      npmInvocation({ bundledCli: null, electronExecutable: "/minddy", systemNpm: "/usr/local/bin/npm" }),
    ).toEqual({ executable: "/usr/local/bin/npm", argsPrefix: [], extraEnv: {}, source: "system" });
  });

  it("gives the harness the same bundled npm for its authoritative check", () => {
    expect(
      opencodeNpmProgram({
        [MINDDY_NPM_CLI_ENV]: "/app.asar/node_modules/npm/bin/npm-cli.js",
        [MINDDY_NODE_EXEC_ENV]: "/Applications/minddy.app/Contents/MacOS/minddy",
      }),
    ).toEqual({
      executable: "/Applications/minddy.app/Contents/MacOS/minddy",
      argsPrefix: ["/app.asar/node_modules/npm/bin/npm-cli.js"],
      electronRunAsNode: true,
    });
    expect(opencodeNpmProgram({})).toEqual({
      executable: "npm",
      argsPrefix: [],
      electronRunAsNode: false,
    });
  });

  it("places the binary where the harness will look for it", () => {
    // Two drives, one path: if it diverges, the shell installs
    // 144 MB next to what the harness is looking for, and no one says it.
    expect(opencodeBin("/data/opencode")).toBe("/data/opencode/node_modules/.bin/opencode");
    expect(opencodePackageManifestPath("/data/opencode")).toBe(
      "/data/opencode/node_modules/opencode-ai/package.json",
    );
    expect(opencodePackageManifestPath("/data/opencode/")).toBe(
      opencodePackageManifestPath("/data/opencode"),
    );
    expect(opencodePluginManifestPath("/data/opencode")).toBe(
      "/data/opencode/node_modules/@opencode-ai/plugin/package.json",
    );
  });

  it("pins the version in the command", () => {
    expect(opencodeInstallArgs("/data/opencode", WANTED)).toContain(`opencode-ai@${WANTED}`);
    expect(opencodeInstallArgs("/data/opencode")).toContain(`opencode-ai@${OPENCODE_VERSION}`);
    expect(opencodeInstallArgs("/data/opencode", WANTED)).toContain(
      `@opencode-ai/plugin@${WANTED}`,
    );
  });

  /**
 * ⚠ **THE DEFECT WHICH COSTED A REAL TEST, AND 144 MB IN A HOME.**
 *
 * `npm install` with a `cwd` on a folder without `package.json` **backs
 * the tree** to the first one it finds and installs in it, making
 * **0**. Measured: started from `~/Library/Application Support/minddy-dev/opencode`,
 * npm went up to `/Users/<moi>/package.json`, put 144 MB in
 * `~/node_modules` and added itself to the home dependencies. The installation folder
 * remained empty, and the harness waited for a server which
 * would never exist.
 *
 * In the microVM it worked by LUCK: `/vercel/oc` has no ancestor which
 * carries a `package.json`. The hypothesis was not written anywhere.
 */
  it("tells npm WHERE to install instead of letting it search", () => {
    const args = opencodeInstallArgs("/data/opencode");
    expect(args).toContain("--prefix");
    expect(args[args.indexOf("--prefix") + 1]).toBe("/data/opencode");
  });

  it("pose un `package.json` dans le dossier — la porte fermée une seconde fois", () => {
    expect(opencodeInstallManifestPath("/data/opencode")).toBe("/data/opencode/package.json");
    const manifest = JSON.parse(OPENCODE_INSTALL_MANIFEST) as Record<string, unknown>;
    expect(manifest.private).toBe(true);
    // A human who comes across this folder in `~/Library/Application Support/`
    // must understand where it comes from without opening anything else.
    expect(String(manifest.description)).toMatch(/minddy/i);
  });
});

describe("ce que l'utilisateur lit", () => {
  it("asks to repair the app when its bootstrap and system fallback are missing", () => {
    const message = opencodeRefusalMessage("no_npm", WANTED);
    expect(message).toMatch(/reinstall or update minddy/i);
    expect(message).toContain(WANTED);
  });

  it("explique les dix secondes d'attente, et distingue les deux causes", () => {
    expect(opencodeInstallNote("missing", WANTED)).toMatch(/first turn/i);
    expect(opencodeInstallNote("version", WANTED)).toMatch(/pinned version changed/i);
  });
});
