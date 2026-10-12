import { setTimeout as delay } from "node:timers/promises";
import { localRuntimeStartupState } from "./local-runtime-platform";

interface RuntimeProcess {
  exitCode: number | null;
  on: (event: "error", listener: (error: Error) => void) => unknown;
}

interface Options<Process extends RuntimeProcess> {
  healthy: (signal: AbortSignal) => Promise<boolean>;
  spawn: (root: string) => Process;
  stop: (process: Process) => void;
  timeoutMs?: number;
  pollMs?: number;
}

/** Share startup readiness and cancel only the process owned by that attempt. */
export function createLocalRuntimeLifecycle<Process extends RuntimeProcess>(options: Options<Process>) {
  let runtime: Process | null = null;
  let pending: { promise: Promise<void>; controller: AbortController } | null = null;

  async function startAttempt(root: string, signal: AbortSignal) {
    const healthy = await options.healthy(signal);
    signal.throwIfAborted();
    const state = localRuntimeStartupState(healthy, runtime !== null && runtime.exitCode === null);
    if (state === "ready") return;
    if (state === "external") {
      throw new Error("Local minddy is already running outside the desktop app. Stop it in its terminal with Ctrl+C, then try again.");
    }
    const process = runtime && runtime.exitCode === null ? runtime : options.spawn(root);
    runtime = process;
    let spawnError: Error | undefined;
    process.on("error", error => { spawnError = error; });
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
    try {
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (spawnError) throw spawnError;
        if (process.exitCode !== null) {
          throw new Error(`The local launcher stopped with code ${process.exitCode}. Open Terminal and run pnpm self-host:local to see its output.`);
        }
        const ready = await options.healthy(signal);
        signal.throwIfAborted();
        if (spawnError) throw spawnError;
        if (process.exitCode !== null) {
          throw new Error(`The local launcher stopped with code ${process.exitCode}. Open Terminal and run pnpm self-host:local to see its output.`);
        }
        if (ready) return;
        await delay(options.pollMs ?? 750, undefined, { signal });
      }
      throw new Error("minddy did not become ready within 10 minutes. Check Docker, then try again.");
    } catch (error) {
      if (runtime === process) {
        runtime = null;
        options.stop(process);
      }
      throw error;
    }
  }

  return {
    start(root: string): Promise<void> {
      if (pending) return pending.promise;
      const controller = new AbortController();
      const attempt = { controller, promise: startAttempt(root, controller.signal) };
      pending = attempt;
      attempt.promise = attempt.promise.finally(() => {
        if (pending === attempt) pending = null;
      });
      return attempt.promise;
    },
    stop() {
      pending?.controller.abort();
      pending = null;
      const process = runtime;
      runtime = null;
      if (process) options.stop(process);
    },
  };
}
