import { spawn } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { app } from "electron";

import { childEnv } from "@/lib/desktop/child-env";
import {
  opencodeBin,
  opencodeDecision,
  electronToolShim,
  localRuntimePath,
  npmInvocation,
  readOpencodeManifestVersion,
  type NpmInvocation,
  type OpencodeDecision,
} from "@/lib/desktop/opencode-install";
import {
  OPENCODE_INSTALL_MANIFEST,
  MINDDY_RUNTIME_BIN_ENV,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
} from "@/lib/server/agent/vm/opencode-version";

/**
 * THE `fs` AND THE `spawn` OF THE PRE-FLIGHT OPENCODE (MIN-293) — and nothing else.
 *
 * All decisions (whether to install, which command, which denial, which
 * phrase) live in [@/lib/desktop/opencode-install](../../lib/desktop/opencode-install.ts),
 * with their test. Here there are only three disk reads, a search in
 * the `PATH` and a `npm`.
 */

/** Does the binary exist, and would the kernel be willing to run it? */
function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is `npm` there? We search in the `PATH` **without launching `npm --version`**:
 * on a Mac without Command Line Tools, invoking an absent executable causes the This is exactly the trap that `lib/desktop/local-repo.ts`
 * already avoids by reading `.git/config` instead of running `git`.
 */
function npmOnPath(runtimePath: string): string | null {
  for (const dir of runtimePath.split(":")) {
    if (!dir) continue;
    const candidate = `${dir.replace(/\/+$/, "")}/npm`;
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/** Node managers store their versions outside the PATH of GUI apps. */
function managedNodeBins(home: string): string[] {
  const bins = [
    `${home}/.volta/bin`,
    `${home}/.asdf/shims`,
    `${home}/.local/share/mise/shims`,
    `${home}/.local/bin`,
  ];
  for (const [root, suffix] of [
    [`${home}/.nvm/versions/node`, "bin"],
    [`${home}/.local/share/fnm/node-versions`, "installation/bin"],
    [`${home}/.fnm/node-versions`, "installation/bin"],
  ] as const) {
    try {
      const versions = readdirSync(root).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      );
      bins.push(...versions.map((version) => `${root}/${version}/${suffix}`));
    } catch {
      // Manager missing: this is not a bootstrap error.
    }
  }
  return bins;
}

function bundledNpmCli(): string | null {
  const candidate = path.join(app.getAppPath(), "node_modules", "npm", "bin", "npm-cli.js");
  try {
    accessSync(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Gives the harness real `node` and `npm` commands, even without a Node
 * system string. They run the signed Electron runtime; the npm shim also serves
 * for `npm install` that the agent then launches in the user's repository.
 */
function electronToolBin(npmCli: string | null): string | null {
  const binDir = path.join(app.getPath("userData"), "agent-runtime", "bin");
  try {
    mkdirSync(binDir, { recursive: true });
    const tools: Array<[string, string[]]> = [["node", []]];
    if (npmCli) tools.push(["npm", [npmCli]]);
    for (const [name, args] of tools) {
      const file = path.join(binDir, name);
      const source = electronToolShim(process.execPath, args);
      try {
        if (readFileSync(file, "utf8") === source) {
          chmodSync(file, 0o700);
          continue;
        }
      } catch {
        // First launch, or shim from a previous version.
      }
      const staged = `${file}.${process.pid}.tmp`;
      writeFileSync(staged, source, { encoding: "utf8", mode: 0o700 });
      renameSync(staged, file);
    }
    return binDir;
  } catch {
    return null;
  }
}

/** Environment common to bootstrap, harness and tools shells. */
export function localRuntimeEnv(): Record<string, string> {
  const env = childEnv(process.env);
  const home = env.HOME ?? app.getPath("home");
  const npmCli = bundledNpmCli();
  const toolBin = electronToolBin(npmCli);
  if (toolBin) env[MINDDY_RUNTIME_BIN_ENV] = toolBin;
  env.PATH = localRuntimePath(env.PATH, [
    ...(toolBin ? [toolBin] : []),
    ...managedNodeBins(home),
  ]);
  const npm = npmInvocation({
    bundledCli: npmCli,
    electronExecutable: process.execPath,
    systemNpm: npmOnPath(env.PATH),
  });
  // `ELECTRON_RUN_AS_NODE` must never contaminate the harness or tools.
  // It is added only to the npm process, in `installOpencode` and in the
  // harness fallback. Only inert paths travel there.
  if (npm?.source === "bundled") {
    for (const [key, value] of Object.entries(npm.extraEnv)) {
      if (key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
    }
  }
  return env;
}

function availableNpm(env: Record<string, string>): NpmInvocation | null {
  return npmInvocation({
    bundledCli: bundledNpmCli(),
    electronExecutable: process.execPath,
    systemNpm: npmOnPath(env.PATH),
  });
}

/** What the shell read, ready for decision. */
export function readOpencodeFacts(installDir: string): {
  decision: OpencodeDecision;
  npm: NpmInvocation | null;
  env: Record<string, string>;
} {
  const env = localRuntimeEnv();
  const npm = availableNpm(env);
  let installedVersion: string | null = null;
  let pluginVersion: string | null = null;
  try {
    installedVersion = readOpencodeManifestVersion(
      readFileSync(opencodePackageManifestPath(installDir), "utf8"),
    );
  } catch {
    // No packet: `installedVersion` remains `null`, and the decision reads it.
  }
  try {
    pluginVersion = readOpencodeManifestVersion(
      readFileSync(opencodePluginManifestPath(installDir), "utf8"),
    );
  } catch {
    // An installation prior to this cache only had the binary.
  }
  return {
    decision: opencodeDecision({
      installedVersion,
      pluginVersion,
      binaryPresent: isExecutable(opencodeBin(installDir)),
      npmAvailable: npm !== null,
    }),
    npm,
    env,
  };
}

/**
 * `npm i opencode-ai@<pinned-version>` in the MACHINE folder (never the
 * run: 144 MB per ticket, otherwise).
 *
 * Returns `null` if successful, the error message otherwise — never a exception.
 * The caller is the thrower, whose contract is to deny a round BEFORE the fork
 * with a sentence in the log, not raise to a place where no one
 * is listening anymore.
 */
export function installOpencode(opts: {
  installDir: string;
  npm: NpmInvocation;
  env: Record<string, string>;
  timeoutMs?: number;
}): Promise<string | null> {
  /**
 * ⚠ **THE `package.json` BEFORE INSTALL** (MIN-293). Without it, `npm` goes back
 * the tree to the first one it finds and installs IN, making
 * 0 — measured: 144 MB in `~/node_modules` and this folder remained empty. The
 * `--prefix` of `opencodeInstallArgs` closes the same door a second time.
 */
  try {
    writeFileSync(opencodeInstallManifestPath(opts.installDir), OPENCODE_INSTALL_MANIFEST, "utf8");
  } catch (error) {
    return Promise.resolve(`could not prepare ${opts.installDir}: ${(error as Error).message}`);
  }

  return new Promise((resolve) => {
    const childEnv = { ...opts.env, ...opts.npm.extraEnv };
    const runtimeBin = childEnv[MINDDY_RUNTIME_BIN_ENV];
    if (opts.npm.source === "bundled" && runtimeBin) {
      childEnv.PATH = `${runtimeBin}:${childEnv.PATH ?? ""}`;
    }
    const child = spawn(
      opts.npm.executable,
      [...opts.npm.argsPrefix, ...opencodeInstallArgs(opts.installDir)],
      {
        cwd: opts.installDir,
        stdio: ["ignore", "ignore", "pipe"],
        // A `npm` which would inherit the Electron environment can find a
        // `NODE_OPTIONS` that doesn't concern it and cause it to fail in some way
        // incomprehensible. `ELECTRON_RUN_AS_NODE` is only reintroduced
        // for embedded npm, after filtering `childEnv`.
        env: childEnv,
      },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Un `npm install` qui n'a pas rendu au bout de cinq minutes ne rendra pas :
    // registry unreachable, corporate proxy swallowing connection. Better
    // a refusal which says that a turn is blocked before having started.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve("opencode install timed out after 5 minutes");
    }, opts.timeoutMs ?? 5 * 60_000);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(`opencode install could not start: ${error.message}`);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(`opencode install failed (exit ${code}): ${stderr.slice(-500)}`);
        return;
      }
      /**
 * **A `npm` THAT RETURNS 0 DOES NOT PROVE THAT THE BINARY IS THERE**, and that's
 * exactly what happened: install "successful", empty folder, and the
 * pre-flight which announced "ready" to the launcher. A lying pre-flight is worse
 * than no pre-flight — it moves the failure three floors down, into a
 * `spawn ENOENT` that the harness reads as slow.
 */
      if (!isExecutable(opencodeBin(opts.installDir))) {
        resolve(
          `opencode install reported success but ${opencodeBin(opts.installDir)} is missing — ` +
            `npm may have installed into a parent package instead of ${opts.installDir}`,
        );
        return;
      }
      resolve(null);
    });
  });
}
