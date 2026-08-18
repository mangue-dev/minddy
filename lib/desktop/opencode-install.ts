import {
  MINDDY_NODE_EXEC_ENV,
  MINDDY_NPM_CLI_ENV,
  OPENCODE_VERSION,
  opencodeBin,
} from "@/lib/server/agent/vm/opencode-version";

/**
 * OPENCODE'S BINARY ON THE MACHINE (MIN-293) — the half that is decided without
 * the disk.
 *
 * ## Why this is a launcher PRE-FLIGHT, not a harness concern
 *
 * The harness already knows how to install itself: `ensureInstalled`
 * ([opencode-host.ts](../server/agent/vm/opencode-host.ts)) installs the package when
 * it is missing or when the version diverges, which is what lets a microVM run even
 * without an up-to-date snapshot. We do not replace it — we run it earlier as well,
 * and this is not redundant: **it is about the LOG**.
 *
 * An installation that fails inside the harness fails at the exact place
 * where there is nothing to read — the turn has not spoken yet, no event exists,
 * and the only witness is a `stdio` stream that was not connected anywhere before MIN-363.
 * Done here, it has a log ([run-log.ts](run-log.ts)), a named refusal, and a
 * recovery action. That is the difference between “it does not work” and a
 * sentence you can paste into a support thread.
 *
 * ## The unknown that the audit didn't name: `npm`
 *
 * `ensureInstalled` shells out to `npm i opencode-ai@…`. **Electron bundles Node,
 * not npm.** The launcher therefore provides a fallback npm in the signed bundle and
 * runs it with Electron's Node. The system npm remains available to older app
 * installations, and the user's PATH is still repaired for tool shells, but neither
 * is required to start OpenCode.
 *
 * ## Once per MACHINE, not once per turn
 *
 * 144 MB, 10.6 seconds to install. The folder is machine-specific
 * (`HarnessLayout.opencodeDir` is NOT under the run root — cf.
 * [harness-layout.ts](../server/agent/harness-layout.ts)), so two simultaneous runs
 * share it, and the second turn for a ticket pays nothing again.
 *
 * ## The entitlement that goes with it, and what it opens
 *
 * Running this binary from a signed app requires
 * `com.apple.security.cs.disable-library-validation`
 * ([entitlements.mac.plist](../../desktop/build/entitlements.mac.plist)) — this
 * is documented explicitly, including the cost: **combined with
 * `allow-dyld-environment-variables`, already present for Chromium, it makes
 * minddy a TCC inheritance vehicle.**
 */

export { OPENCODE_VERSION, opencodeBin };

/** A deduplicated POSIX path that preserves the already configured shell first. */
export function localRuntimePath(current: string | undefined, discovered: readonly string[]): string {
  const ordered = [
    ...(current ?? "").split(":"),
    ...discovered,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [...new Set(ordered.filter((entry) => entry.trim()))].join(":");
}

/** POSIX script that turns the Electron executable into a Node/npm command. */
export function electronToolShim(executable: string, args: readonly string[] = []): string {
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  return (
    `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${[executable, ...args].map(quote).join(" ")}` +
    ` "$@"\n`
  );
}

export interface NpmInvocation {
  readonly executable: string;
  readonly argsPrefix: readonly string[];
  readonly extraEnv: Readonly<Record<string, string>>;
  readonly source: "bundled" | "system";
}

/**
 * The npm bundled with the app takes priority: it makes the first launch
 * independent of the user's shell configuration. The system npm remains a useful
 * fallback in development and for older installations.
 */
export function npmInvocation(opts: {
  bundledCli: string | null;
  electronExecutable: string;
  systemNpm: string | null;
}): NpmInvocation | null {
  if (opts.bundledCli) {
    return {
      executable: opts.electronExecutable,
      argsPrefix: [opts.bundledCli],
      extraEnv: {
        ELECTRON_RUN_AS_NODE: "1",
        [MINDDY_NPM_CLI_ENV]: opts.bundledCli,
        [MINDDY_NODE_EXEC_ENV]: opts.electronExecutable,
      },
      source: "bundled",
    };
  }
  if (!opts.systemNpm) return null;
  return {
    executable: opts.systemNpm,
    argsPrefix: [],
    extraEnv: {},
    source: "system",
  };
}

/** What the probe read from disk before making its decision. */
export interface OpencodeFacts {
  /** The version recorded in `node_modules/opencode-ai/package.json`, or `null`. */
  readonly installedVersion: string | null;
  /** The tool runtime version, installed alongside the binary. */
  readonly pluginVersion: string | null;
  /** Whether the binary exists and is executable. */
  readonly binaryPresent: boolean;
  /** Whether an `npm` executable was found on `PATH`. */
  readonly npmAvailable: boolean;
}

export type OpencodeDecision =
  /** Nothing to do: the correct version is already present. */
  | { readonly action: "ready" }
  /**
   * To install, with the reason attached: `missing` on a new machine,
   * `version` when the pin changed. The distinction is meaningful — the latter
   * deserves a log line because it explains a ten-second wait during an app update.
   */
  | { readonly action: "install"; readonly why: "missing" | "version" }
  /** Impossible: nothing is on disk, and nothing is available to put there. */
  | { readonly action: "refuse"; readonly reason: "no_npm" };

/**
 * SHOULD OPENCODE BE INSTALLED?
 *
 * Version comparison matters as much as presence, and for the same reason
 * described in `ensureInstalled`: an existence check alone would accept yesterday's
 * binary, and every turn would run on the old engine while the repository claimed
 * otherwise — without a log line. This repository's measurement record covers THIS
 * binary
 * ([docs/harness-opencode.md](../../docs/harness-opencode.md)), pas sur une API
 * publique.
 */
export function opencodeDecision(
  facts: OpencodeFacts,
  wanted: string = OPENCODE_VERSION,
): OpencodeDecision {
  if (
    facts.binaryPresent &&
    facts.installedVersion === wanted &&
    facts.pluginVersion === wanted
  ) {
    return { action: "ready" };
  }
  if (!facts.npmAvailable) return { action: "refuse", reason: "no_npm" };
  const why = facts.installedVersion && facts.installedVersion !== wanted ? "version" : "missing";
  return { action: "install", why };
}

/**
 * The installation command and directory paths live in
 * [opencode-version.ts](../server/agent/vm/opencode-version.ts) depuis MIN-293 :
 * the harness installs them too, and two copies of the same command can otherwise
 * drift into using different flags. Those flags matter — `--prefix` keeps `npm` from
 * walking up the directory tree and installing into the home directory.
 */

/** The version read from this manifest, or `null` if the package is present without one. */
export function readOpencodeManifestVersion(raw: string): string | null {
  try {
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version : null;
  } catch {
    return null;
  }
}

/**
 * The log message. It names the action — `xcode-select --install` is the
 * incantation that installs `npm` on a Mac without the toolchain, and no one can infer it.
 */
export function opencodeRefusalMessage(reason: "no_npm", wanted = OPENCODE_VERSION): string {
  return (
    `minddy needs opencode ${wanted} to run an agent turn on this Mac, but neither its bundled ` +
    "npm nor a system npm is available. Reinstall or update minddy, then start the turn again."
  );
}

/** What we write to the log before waiting ten seconds. */
export function opencodeInstallNote(why: "missing" | "version", wanted = OPENCODE_VERSION): string {
  return why === "version"
    ? `installing opencode ${wanted} — the pinned version changed since the last turn`
    : `installing opencode ${wanted} — first turn on this Mac, this takes about ten seconds`;
}
