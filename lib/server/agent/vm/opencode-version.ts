/**
 * WHAT VERSION OPENCODE RUNS IN, WHERE ITS BINARY IS FOUND, AND HOW TO WORK
 * L'INSTALLE (MIN-286, lot 3 ; MIN-293).
 *
 * Module WITHOUT ANY import, and this is its reason for being: these values ​​have
 * **trois** lecteurs qui ne se ressemblent pas —
 *
 * - [opencode-host.ts](opencode-host.ts), in the harness, which installs the
 * binary if missing and throws it;
 *  - [scripts/create-agent-snapshot.ts](../../../../scripts/create-agent-snapshot.ts),
 * on the station, which **cooks** this same binary in the pre-heated image
 *    (`AGENT_SANDBOX_SNAPSHOT_ID`) ;
 * - PRE-FLIGHT desktop app (MIN-293,
 *    [desktop/src/opencode-install.ts](../../../../desktop/src/opencode-install.ts)),
 * which installs it before the fork so that the failure has a log.
 *
 * Everyone must pose **exactly the same path, exactly the same version and
 * exactly the same command**, without which the snapshot is useless: the
 * cooked binary would be next to the one the harness is looking for, or a version
 * that the pin refuses, and each new microVM would pay the 10.6 s
 * installation without anything saying so. The script is a `tsx` launched at
 * main: it cannot import `opencode-host.ts` without dragging all the
 * supervisor (repo-host, redact, models, etc.) behind him. Hence this file,
 * who has nothing to drag around.
 */

/** The version of opencode that this repository measured. See docs/harness-opencode.md. */
export const OPENCODE_VERSION = "1.18.16";

/**
 * The local fallback path to npm travels in the harness environment.
 * In a microVM these variables are absent and the harness uses the `npm`
 * of the image. In the desktop app, they refer to the signed and packaged npm
 * with minddy, executed by the Node that Electron already has on board.
 */
export const MINDDY_NPM_CLI_ENV = "MINDDY_NPM_CLI";
export const MINDDY_NODE_EXEC_ENV = "MINDDY_NODE_EXEC";
export const MINDDY_RUNTIME_BIN_ENV = "MINDDY_RUNTIME_BIN";

/** Npm program chosen by the harness, testable without launching a process. */
export function opencodeNpmProgram(
  env: Readonly<Record<string, string | undefined>>,
): { executable: string; argsPrefix: string[]; electronRunAsNode: boolean } {
  const cli = env[MINDDY_NPM_CLI_ENV]?.trim();
  const node = env[MINDDY_NODE_EXEC_ENV]?.trim();
  return cli && node
    ? { executable: node, argsPrefix: [cli], electronRunAsNode: true }
    : { executable: "npm", argsPrefix: [], electronRunAsNode: false };
}

/**
 * The binary, such as `npm i opencode-ai` places it in its installation folder.
 *
 * The FILE is a layout value since MIN-354
 * (`HarnessLayout.opencodeDir`): `/vercel/oc` in the microVM, elsewhere on a
 * ordinary machine. It is NOT run-specific — 144MB of binary is shared
 * between runs of the same machine, and cooking it per run would amount to
 * reinstall with each ticket.
 */
export function opencodeBin(installDir: string): string {
  return `${installDir}/node_modules/.bin/opencode`;
}

/**
 * THE INSTALLATION ORDER, AND THE TWO EXPENSIVE FLAGS (MIN-293).
 *
 * ## What happened, measured on a real Mac
 *
 * `npm i opencode-ai@…` launched with `cwd` on a folder **without `package.json`**
 * does not install there: **npm REMOVAL the tree** to the first
 * `package.json` that it finds, and installs in it. On the test Mac, it is
 * moved up from `~/Library/Application Support/minddy-dev/opencode` until
 * `/Users/<moi>/package.json`, placed 144 MB in `~/node_modules`, **and
 * added to the home** outbuildings. The installation folder remained
 * empty — and `npm` returned **0**.
 *
 * The harness therefore found its missing binary, launched it anyway, and waited
 * a server that would never exist. Three symptoms, one cause, and none of the
 * trois ne nomme npm.
 *
 * In microVM this had never happened, and it was LUCKY: the
 * ancestors of `/vercel/oc` are `/vercel` and `/`, where there is no
 * `package.json`. The hypothesis was not written anywhere.
 *
 * ## The two safeguards, and why we need two
 *
 * - **`--prefix`** tells npm where to install, without it having to search. It's him
 * who closes the door;
 * - **the `package.json` placed in the folder** ({@link OPENCODE_INSTALL_MANIFEST})
 * closes it a second time, and makes the file readable by a human who
 * falls on it in `~/Library/Application Support/`.
 *
 * `--omit=dev` and `--no-audit` are not comfortable: this folder is not a
 * project, no one develops on it, and one more network audit delays a round.
 */
export function opencodeInstallArgs(
  installDir: string,
  version: string = OPENCODE_VERSION,
): string[] {
  return [
    "install",
    "--prefix",
    installDir,
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--silent",
    `opencode-ai@${version}`,
    `@opencode-ai/plugin@${version}`,
  ];
}

/**
 * The `package.json` of the installation folder. Minimal, `private` so that no
 * publication is even conceivable, and named so that we know where it comes from.
 */
export const OPENCODE_INSTALL_MANIFEST = `${JSON.stringify(
  {
    name: "minddy-opencode",
    private: true,
    version: "1.0.0",
    description: "Dossier d'installation d'opencode pour minddy — ne rien éditer ici.",
  },
  null,
  2,
)}\n`;

/** The path of this manifesto. */
export function opencodeInstallManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/package.json`;
}

/** The manifest of the INSTALLED package, from which we reread the version actually installed. */
export function opencodePackageManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/node_modules/opencode-ai/package.json`;
}

/** The tools TypeScript runtime, shared instead of being reinstalled per run. */
export function opencodePluginManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/node_modules/@opencode-ai/plugin/package.json`;
}
