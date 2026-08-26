import { spawn } from "node:child_process";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { HarnessLayout } from "../harness-layout";
import { withOpencodeInstallLock } from "@/lib/desktop/opencode-install-lock";
import {
  forgetHarnessChild,
  noteHarnessChild,
  processBirthMarker,
} from "./child-registry";
import { OpencodeClient } from "./opencode-client";
import {
  OPENCODE_INSTALL_MANIFEST,
  OPENCODE_VERSION,
  MINDDY_RUNTIME_BIN_ENV,
  opencodeBin,
  opencodeInstallArgs,
  opencodeInstallManifestPath,
  opencodeNpmProgram,
  opencodePackageManifestPath,
  opencodePluginManifestPath,
} from "./opencode-version";
import type { SupervisorDeps } from "./supervisor";

/**
 * HOW DO WE KEEP AN OPENCODE SERVER ALIVE IN THE MICROVM (MIN-286, lot 3).
 *
 * The supervisor knows nothing about all this, and that is intentional: he receives
 * `startServer` / `writeFile` / `client` in dependencies, which allows it to be
 * tested without running 144 MB of binary. This file is the only
 * REAL implementation of these three, and it only lives in the VM.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * THREE MEASURED THINGS THAT DECIDE ITS FORM (lot 0, §2.7)
 *
 * 1. **The server must remain at the FOREFRONT of a living process.** A
 * `nohup … &` in a `sh -c` of the Sandbox drops the RPC
 * command (`UND_ERR_SOCKET` in ~25 s, zero output lines, `detached: true` changes
 * nothing). Here we are no longer in an RPC command: we are IN the microVM, in
 * the harness process node, which lives as long as the turn lives. `spawn` of an
 * ordinary child is therefore enough.
 *
 * ⚠ **CORRECTION (MIN-293): "the child dies with us" was wrong.** This
 * line said the guarantee we wanted, not the one we had. On POSIX a
 * child is not killed when its parent dies, it is repaired; what kills
 * this one is the supervisor's `finally` — so nothing at all when the
 * harness is killed outright. In a microVM, without consequence: the machine dies at
 * the end of the round. **On a Mac, it's 143 MB and a held port, and the following round
 * fails on a refused `listen`.** Hence the entry in the registry
 * below, which the launcher reads again to finish the job
 * ([child-registry.ts](child-registry.ts)).
 * 2. **Installation costs 10.6 s / 351 MB, startup 1.3 s.** Hence the form:
 * we install ONLY if the binary is missing. Cooked in
 * `AGENT_SANDBOX_SNAPSHOT_ID` by
 * [scripts/create-agent-snapshot.ts](../../../../scripts/create-agent-snapshot.ts),
 * it never misses and a turn nine pays 1.3s; without an up-to-date snapshot, the
 * fallback below still works, it costs ten seconds.
 * **A change of `OPENCODE_VERSION` expires the snapshot**: the cooked binary
 * is no longer the one we want, and as it is not missing, no one will
 * will install it. Replay the script after any bump — it's written in it.
 * 3. **The version is PINED.** This is the harness of the product: an update
 * which would arrive by itself would change engine in the middle of a run (the auto-update
 * is turned off by `opencodeServerEnv`, this pin is the counterpart to
 * installation).
 */

export { opencodeBin, OPENCODE_VERSION };

async function exists(path: string): Promise<boolean> {
  return await access(path).then(
    () => true,
    () => false,
  );
}

/**
 * The version REALLY installed in the installation folder, read on the disk —
 * `null` if nothing is installed, or if the package is there without its manifest.
 *
 * We read it rather than executing `opencode --version`: a `spawn` of 144 MB of
 * native binary in each round to learn a number which is written in a
 * 2 KB file, it's expensive for the same answer.
 */
async function packageVersion(manifestPath: string): Promise<string | null> {
  try {
    const manifest = await readFile(manifestPath, "utf8");
    const version = (JSON.parse(manifest) as { version?: string }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * `npm i` of the binary, and only if it is missing **or if it is not ours**
 * (see §2 and §3 above).
 *
 * THE SECOND HALF OF THIS CONDITION IS WHAT HOLDS THE PIN. A pre-heated snapshot
 * is baked once and then forgotten: the day `OPENCODE_VERSION`
 * moves, an existence test alone would see yesterday's binary, find it very good, and all runs would run on the old engine while the repository
 * swears otherwise — without a log line to say so. So we compare to the
 * number written on the disk, and a discrepancy reinstalls (ten seconds, one
 * time, until the snapshot is replayed).
 */
const activeInstalls = new Map<string, Promise<void>>();

async function installOpencodeIfNeeded(installDir: string): Promise<void> {
  await withOpencodeInstallLock(installDir, async () => {
    const [found, plugin] = await Promise.all([
      packageVersion(opencodePackageManifestPath(installDir)),
      packageVersion(opencodePluginManifestPath(installDir)),
    ]);
    if (
      found === OPENCODE_VERSION &&
      plugin === OPENCODE_VERSION &&
      (await exists(opencodeBin(installDir)))
    ) {
      return;
    }
    if (found && found !== OPENCODE_VERSION) {
      console.log(
        `[opencode] version ${found} installée, ${OPENCODE_VERSION} attendue — réinstallation ` +
          `(snapshot AGENT_SANDBOX_SNAPSHOT_ID à rejouer : scripts/create-agent-snapshot.ts)`,
      );
    }
    await mkdir(installDir, { recursive: true });
    /**
     * ⚠ **THE `package.json` BEFORE INSTALLING, AND IT IS NOT DECORATIVE** (MIN-293).
     *
     * Without it, `npm` BACKSUP the tree to the first `package.json` that it
     * finds and installs IN — returning 0. Measured on a Mac: 144 MB placed
     * in `~/node_modules`, `opencode-ai` added to home dependencies, and this
     * folder left empty. The detail and the two guardrails are in
     * [opencode-version.ts](opencode-version.ts).
     */
    await writeFile(
      opencodeInstallManifestPath(installDir),
      OPENCODE_INSTALL_MANIFEST,
      "utf8",
    );
    await new Promise<void>((resolve, reject) => {
      const npm = opencodeNpmProgram(process.env);
      const installEnv = npm.electronRunAsNode
        ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
        : process.env;
      const runtimeBin = process.env[MINDDY_RUNTIME_BIN_ENV]?.trim();
      if (npm.electronRunAsNode && runtimeBin) {
        installEnv.PATH = `${runtimeBin}:${installEnv.PATH ?? ""}`;
      }
      const child = spawn(
        npm.executable,
        [...npm.argsPrefix, ...opencodeInstallArgs(installDir)],
        {
          cwd: installDir,
          stdio: ["ignore", "ignore", "pipe"],
          env: installEnv,
        },
      );
      let err = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `opencode install failed (exit ${code}): ${err.slice(-500)}`,
              ),
            ),
      );
    });

    /**
     * **A `npm` THAT RETURNS 0 DOES NOT PROVE THAT THE BINARY IS THERE** (MIN-293) — this is
     * exactly what happened. So we reread the disk, and we raise here rather
     * than letting `spawn` fail in `ENOENT` three lines later, where the
     * message no longer names the cause.
     */
    if (!(await exists(opencodeBin(installDir)))) {
      throw new Error(
        `opencode install reported success but ${opencodeBin(installDir)} is missing — ` +
          `check that npm installed into ${installDir} and not into a parent package`,
      );
    }
  });
}

async function ensureInstalled(installDir: string): Promise<void> {
  const active = activeInstalls.get(installDir);
  if (active) return active;
  const install = installOpencodeIfNeeded(installDir).finally(() => {
    if (activeInstalls.get(installDir) === install)
      activeInstalls.delete(installDir);
  });
  activeInstalls.set(installDir, install);
  return install;
}

async function prepareToolRuntime(layout: HarnessLayout): Promise<void> {
  const runtimeDir = `${layout.harnessDir}/config/opencode`;
  await mkdir(runtimeDir, { recursive: true });
  // OpenCode asks its package manager to “prepare” each
  // dossier qui porte des tools. Lier uniquement node_modules ne suffit pas :
  // seeing a different manifest and no lock, npm replaced the link with
  // a 61 MB copy. The three entries now describe exactly the
  // same project already installed; preparation becomes a local no-op.
  for (const [name, type] of [
    ["package.json", "file"],
    ["package-lock.json", "file"],
    ["node_modules", "dir"],
  ] as const) {
    try {
      await symlink(
        `${layout.opencodeDir}/${name}`,
        `${runtimeDir}/${name}`,
        type,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/**
 * The REAL dependencies of the supervisor: a server that we start, files
 * that we write, an HTTP client.
 *
 * `port` is RESERVED by the caller (MIN-354, cf. [free-port.ts](free-port.ts)):
 * it was worth 4096 hard as long as the microVM was ours alone, and two runs on
 * the same machine would have competed for the same socket.
 *
 * `layout` gives the two things that this module cannot guess: where the
 * binary is installed, and what repository the client declares in `directory`.
 */
export function opencodeSupervisorDeps(opts: {
  port: number;
  layout: HarnessLayout;
}): Pick<SupervisorDeps, "startServer" | "writeFile" | "client"> {
  const { port, layout } = opts;
  return {
    startServer: async (env) => {
      await ensureInstalled(layout.opencodeDir);
      await prepareToolRuntime(layout);
      const bin = opencodeBin(layout.opencodeDir);
      const child = spawn(
        bin,
        ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
        {
          // L'environnement du harness PLUS celui du tour : `opencodeServerEnv` ne
          // carries only the config and the folders, but the binary still needs a
          // `PATH` and a `HOME` to launch the tools shell.
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      /**
       * REGISTERED BEFORE SERVING (MIN-293), and it is the order which provides the guarantee:
       * a process killed between its `spawn` and its registration is exactly
       * the orphan that we are trying to no longer produce. No effect in microVM — the
       * launcher that rereads this file is that of the Mac, and a disposable VM has nothing
       * to clean.
       */
      if (child.pid) {
        const birth = processBirthMarker(child.pid);
        if (!birth) {
          child.kill("SIGKILL");
          throw new Error(
            `opencode process identity could not be recorded for pid ${child.pid}`,
          );
        }
        noteHarnessChild(layout.harnessDir, {
          pid: child.pid,
          birth,
          kind: "opencode",
          label: `opencode serve --port ${port}`,
        });
      }
      /**
       * BOTH PIPES ARE READ, and not out of curiosity: a child whose output no one reads ends up blocking on a full pipe — a server that logs for hours gets there. We prefix them and let them
       * go into our own output, which is the one that the microVM keeps.
       */
      const log = (prefix: string) => (chunk: Buffer) => {
        const text = chunk.toString().trimEnd();
        if (text) console.log(`[opencode:${prefix}] ${text.slice(0, 2000)}`);
      };
      child.stdout?.on("data", log("out"));
      child.stderr?.on("data", log("err"));

      /**
       * ⚠ **A SPAWN THAT FAILS IS A FACT, NOT A SLOWNESS** (MIN-293).
       *
       * Before, the failure was only one line of `console.error` and the function
       * still returned its `stop`: the supervisor then left to wait for a
       * server which would never exist, announcing “still waiting for the
       * server (15 s… 30 s… 45 s)” up to its ceiling. The only message that
       * the user saw therefore spoke of SLOWNESS, for an absent binary.
       *
       * `spawn` and `error` are exclusive and exactly one of the two arrives:
       * we wait for the one that comes, and we RAISE on failure. The round ends
       * then in error, with the real cause, in the second.
       */
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", (err) =>
          reject(
            new Error(`opencode could not start (${bin}): ${err.message}`),
          ),
        );
      });
      child.on("error", (err) =>
        console.error("[opencode] runtime error:", err.message),
      );
      return {
        stop: async () => {
          // Unregister first, regardless of state: from here on, this pid is
          // our business and no longer that of the launcher. A pid recycled by the system
          // between two turns would otherwise designate someone else's process.
          if (child.pid) forgetHarnessChild(layout.harnessDir, child.pid);
          if (child.exitCode !== null || child.signalCode !== null) return;
          /**
           * `SIGTERM` then, if it hangs, `SIGKILL`. The server holds a base
           * SQLite: giving it a second to close it properly avoids a bulk
           * WAL log that the next round would replay.
           */
          child.kill("SIGTERM");
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 1_000);
            child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
          });
        },
      };
    },

    writeFile: async (path, content) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    },

    // `directory` is the repository: all routes inherited from opencode want it
    // in query, and it is he who gives the server its project identity (the hash
    // of the first commit — cf. the batch 0 recovery probe).
    client: (baseUrl, auth) =>
      new OpencodeClient({
        baseUrl,
        directory: layout.repoDir,
        ...(auth ? { auth } : {}),
      }),
  };
}
