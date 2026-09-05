import { execFileSync, type ChildProcess } from "node:child_process";

import { processBirthMarker } from "./child-registry";

/** Stop the server and its tools, including shells in separate process groups. */
export async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  // Capture descendants before terminating their parent: once reparented they
  // can no longer be attributed to this turn. Birth markers prevent PID reuse.
  let rows: number[][] = [];
  try {
    rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf8",
      timeout: 2_000,
    }).trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
  } catch (error) {
    // Descendant discovery is best-effort. A missing or overloaded ps must
    // not prevent SIGTERM and SIGKILL from reaching the known server process.
    console.warn("[opencode] Could not enumerate descendants; stopping the server only:", error);
  }
  const pids = new Set([child.pid]);
  for (let size = 0; size !== pids.size;) {
    size = pids.size;
    for (const [pid, parent] of rows) {
      if (pid > 1 && pids.has(parent)) pids.add(pid);
    }
  }
  const descendants = [...pids].reverse().filter((pid) => pid !== child.pid)
    .map((pid) => ({ pid, birth: processBirthMarker(pid) }));
  const signalDescendants = (signal: NodeJS.Signals) => {
    for (const { pid, birth } of descendants) {
      if (!birth || processBirthMarker(pid) !== birth) continue;
      try {
        process.kill(pid, signal);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
      }
    }
  };
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  signalDescendants("SIGTERM");
  child.kill("SIGTERM");
  // Always complete the grace period, even if the parent exits first: a tool
  // can ignore SIGTERM and outlive the server that launched it.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  signalDescendants("SIGKILL");
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await exited;
}
