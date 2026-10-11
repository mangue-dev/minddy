import { join } from "node:path";
import { BACKGROUND_FETCH_BYTES, type BackgroundJobRunner } from "../background";
import { resolveWithin } from "../repo-path";
import type { IsolatedNativeHost, NativeProcess } from "./native-isolation";

/** Keep the kernel wrapper alive so its PID namespace cannot orphan background work. */
export function nativeBackgroundRunner(host: IsolatedNativeHost): BackgroundJobRunner {
  const processes = new Map<string, { process: NativeProcess; logPath: string }>();
  const lookup = (jobId: string, pid: number) => {
    const entry = processes.get(jobId);
    if (!entry || entry.process.pid !== pid) throw new Error("Native background job is unavailable");
    return entry;
  };
  return {
    async start({ jobId, invocation, workdir }) {
      const process = host.startProcess(invocation.executable, invocation.args, { cwd: resolveWithin(host.layout.repoDir, workdir ?? "."), env: invocation.env });
      const logPath = join(host.layout.toolOutputDir, `${jobId}.log`);
      processes.set(jobId, { process, logPath });
      return { pid: process.pid, logPath };
    },
    async read({ jobId, pid, offset }) {
      const { process, logPath } = lookup(jobId, pid);
      await host.writeFile(logPath, process.output);
      const retained = Buffer.from(process.output);
      const beginning = Math.max(0, process.outputBytes - retained.length);
      const from = Math.max(beginning, offset, process.outputBytes - BACKGROUND_FETCH_BYTES);
      return { chunk: retained.subarray(from - beginning).toString("utf8"), nextOffset: process.outputBytes, running: process.exitCode === null, exitCode: process.exitCode, skippedBytes: Math.max(0, from - offset) };
    },
    async stop({ jobId, pid }) { await lookup(jobId, pid).process.stop(); },
  };
}
