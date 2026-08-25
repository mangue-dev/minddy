import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { HarnessLayout } from "../harness-layout";
import type { RepoHost, ShellOptions, ShellResult } from "../repo-host";

/**
 * The same four primitives as `sandboxHost`, but ON-SITE (MIN-224): the
 * loop runs in the microVM, so the repository disk is the local disk and
 * the shell is the local shell.
 *
 * WHAT THIS IS DELETED, and that's the whole point of the ticket: every gesture on the
 * deposit ceases to be an RPC round trip to `iad1`. The scoping measured a
 * `runCommand("true")` at 211 ms median from France, and the same ten
 * commands CHAINED in the VM at 227 ms total — the transport was
 * the bulk of the cost. The exact intra-regional gain remains to be measured (MIN-221 §5),
 * and the migration case does not rely on it.
 *
 * WHAT IT DOES NOT CHANGE. `resolveWithin` and `assertNotGit` keep the same
 * meaning: they are path functions applied to the model arguments before
 * touching the disk, and the harness that turns in the machine it guards does not
 * take anything away from them. What really changes is that the microVM ceases to be
 * "disposable and inconsequential": a `rm -rf /vercel/sandbox` of the kill
 * model now takes its own turn. Inconvenience, not flaw — nothing durable lives there,
 * the branch is pushed — but the argument can no longer be invoked as is.
 *
 * NO `exec` OF `node:child_process`, and this is deliberate. `exec` buffers in
 * a capped string (`maxBuffer`, 1 MB by default) and LIFTS beyond that, discarding
 * what had been produced: a chatty `npm test` would return an error instead of
 * its output. `spawn` + accumulation lets us decide, and it's
 * `command-output.ts` which already decides (cap, spill on disk).
 */

/**
 * What we keep from a flow, by flow. Very above what the model will read
 * (`formatRunCommandResult` caps much lower, and deposits the rest on disk):
 * this ceiling is not a display policy, it is the memory safeguard
 * of a process which must live for hours. A watcher forgotten in the foreground must
 * not cause the harness pile to grow to OOM.
 */
const MAX_STREAM_BYTES = 32 * 1024 * 1024;

/** Grace period between the SIGTERM of a timeout and the SIGKILL. */
const KILL_GRACE_MS = 2_000;

/**
 * Runs `sh -c <command>` and returns exitCode + stdout + stderr, like the sandbox.
 *
 * The three deviations from `child_process.exec`, all wanted:
 *
 * - the output is accumulated in buffers and bounded by `MAX_STREAM_BYTES` — TRUNCATED,
 * never transformed into an error;
 * - a timeout KILLS properly (SIGTERM, thanks, SIGKILL) and returns what had already
 * been written, with a non-zero exitCode: the model must read the partial output
 * from a test which has completed, not an empty message;
 * - an already abandoned `signal` returns immediately, without launching the process. This is
 * what abandoning a subagent expects.
 */
function execLocal(defaultCwd: string, command: string, opts?: ShellOptions): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    if (opts?.signal?.aborted) {
      resolve({ exitCode: 130, stdout: "", stderr: "aborted" });
      return;
    }
    const child = spawn("sh", ["-c", command], {
      cwd: opts?.cwd ?? defaultCwd,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      // Separate process group: a `npm test` which itself launched children
      // must not survive them when killed. `-pid` hits the entire group.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    const collect = (into: Buffer[], counted: number, chunk: Buffer): number => {
      if (counted >= MAX_STREAM_BYTES) return counted;
      into.push(chunk);
      return counted + chunk.length;
    };
    child.stdout.on("data", (c: Buffer) => {
      outBytes = collect(out, outBytes, c);
    });
    child.stderr.on("data", (c: Buffer) => {
      errBytes = collect(err, errBytes, c);
    });

    let timedOut = false;
    const kill = (): void => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, KILL_GRACE_MS).unref();
    };

    const timer =
      opts?.timeoutMs != null && opts.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            kill();
          }, opts.timeoutMs)
        : null;
    const onAbort = () => kill();
    opts?.signal?.addEventListener("abort", onAbort, { once: true });

    const done = (exitCode: number) => {
      if (timer) clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      const stderrText = Buffer.concat(err).toString("utf8");
      resolve({
        exitCode,
        stdout: Buffer.concat(out).toString("utf8"),
        // The timeout is SOLD in stderr, like the sandbox does: without that, a
        // command killed at 180 s returned a bare exit 143, which the model rereads as
        // a failure of the command itself.
        stderr: timedOut
          ? `${stderrText}${stderrText.endsWith("\n") || !stderrText ? "" : "\n"}Command timed out after ${opts?.timeoutMs} ms and was killed.`
          : stderrText,
      });
    };

    // `sh -c` not found, cwd does not exist: this is not a command that fails,
    // this is an impossible launch. The caller treats it as a tool error.
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    // `close` and not `exit`: `exit` can happen before the pipes are
    // drained, and we would then return an output without its end.
    child.on("close", (code, signal) => done(code ?? (signal ? 143 : 1)));
  });
}

/**
 * The harness's local hands on the run repository.
 *
 * `layout` comes from the JOB since MIN-354: the harness no longer decides where it
 * works, it learns it — and two runs on the same machine have two layouts
 * disjoint, therefore two repositories, two output folders and two harness.
 */
export function localHost(
  layout: HarnessLayout,
  processIsolation: RepoHost["processIsolation"] = "host",
): RepoHost {
  return {
    layout,
    processIsolation,
    exec: (command, opts) => execLocal(layout.repoDir, command, opts),
    readFile: async (absPath: string): Promise<string | null> => {
      try {
        return await readFile(absPath, "utf8");
      } catch (err) {
        // ENOENT is the expected response ("the file does not exist"), and it is
        // the `sandbox.readFileToBuffer` contract. The rest — EACCES, EISDIR —
        // is a real error: making it "absent" would cause it to be written by
        // `edit_file` a file that the model believed to be empty.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    writeFile: async (absPath: string, content: string): Promise<void> => {
      await writeFile(absPath, content, "utf8");
    },
    mkdir: async (absPath: string): Promise<void> => {
      await mkdir(absPath, { recursive: true });
    },
  };
}
