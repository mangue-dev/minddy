import { setTimeout as delay } from "node:timers/promises";
import { localRuntimeStartupState } from "./local-runtime-platform";

interface RuntimeProcess {
  exitCode: number | null;
  signalCode?: string | null;
  on: (event: "error", listener: (error: Error) => void) => unknown;
}

function isLive(process: RuntimeProcess): boolean {
  return process.exitCode === null && !process.signalCode;
}

function launcherExitError(process: RuntimeProcess): Error {
  const reason = process.signalCode ? `signal ${process.signalCode}` : `code ${process.exitCode}`;
  return new Error(`The local launcher stopped with ${reason}. Open Terminal and run pnpm self-host:local to see its output.`);
}

interface Options<Process extends RuntimeProcess> {
  healthy: (signal: AbortSignal) => Promise<boolean>;
  spawn: (root: string) => Process;
  stop: (process: Process) => void;
  timeoutMs?: number;
  pollMs?: number;
  stopTimeoutMs?: number;
}

/** Share startup readiness and cancel only the process owned by that attempt. */
export function createLocalRuntimeLifecycle<Process extends RuntimeProcess>(options: Options<Process>) {
  let runtime: Process | null = null;
  let runtimeRoot: string | null = null;
  let pending: { root: string; promise: Promise<void>; controller: AbortController } | null = null;

  async function startAttempt(root: string, signal: AbortSignal) {
    if (runtime && isLive(runtime) && runtimeRoot !== root) {
      const previous = runtime;
      runtime = null;
      runtimeRoot = null;
      options.stop(previous);
      const deadline = Date.now() + (options.stopTimeoutMs ?? 30_000);
      while (true) {
        const healthy = await options.healthy(signal);
        signal.throwIfAborted();
        if (!isLive(previous) && !healthy) break;
        if (Date.now() >= deadline) {
          throw new Error("The previous local minddy launcher did not stop. Stop it before choosing a different minddy folder.");
        }
        await delay(options.pollMs ?? 750, undefined, { signal });
      }
    }
    const healthy = await options.healthy(signal);
    signal.throwIfAborted();
    const state = localRuntimeStartupState(healthy, runtime !== null && isLive(runtime));
    if (state === "ready") return;
    if (state === "external") {
      throw new Error("Local minddy is already running outside the desktop app. Stop it in its terminal with Ctrl+C, then try again.");
    }
    const process = runtime && isLive(runtime) ? runtime : options.spawn(root);
    runtime = process;
    runtimeRoot = root;
    let spawnError: Error | undefined;
    process.on("error", error => { spawnError = error; });
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
    try {
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (spawnError) throw spawnError;
        if (!isLive(process)) throw launcherExitError(process);
        const ready = await options.healthy(signal);
        signal.throwIfAborted();
        if (spawnError) throw spawnError;
        if (!isLive(process)) throw launcherExitError(process);
        if (ready) return;
        await delay(options.pollMs ?? 750, undefined, { signal });
      }
      throw new Error("minddy did not become ready within 10 minutes. Check Docker, then try again.");
    } catch (error) {
      if (runtime === process) {
        runtime = null;
        runtimeRoot = null;
        options.stop(process);
      }
      throw error;
    }
  }

  return {
    start(root: string): Promise<void> {
      if (pending) {
        return pending.root === root
          ? pending.promise
          : Promise.reject(new Error("Local minddy is already starting from another folder. Wait for it to finish, then choose the new folder."));
      }
      const controller = new AbortController();
      const attempt = { root, controller, promise: startAttempt(root, controller.signal) };
      pending = attempt;
      attempt.promise = attempt.promise.finally(() => {
        if (pending === attempt) pending = null;
      });
      return attempt.promise;
    },
    /**
     * Whether the launcher this app started is still alive, for that folder.
     * The local account's session is handed out only then (MIN-781): anything
     * else answering the local port is not the instance the app installed.
     */
    ownsLiveRuntime(root: string): boolean {
      return runtime !== null && isLive(runtime) && runtimeRoot === root;
    },
    stop() {
      pending?.controller.abort();
      pending = null;
      const process = runtime;
      runtime = null;
      runtimeRoot = null;
      if (process) options.stop(process);
    },
  };
}
