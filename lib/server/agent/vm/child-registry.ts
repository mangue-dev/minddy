import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { BackgroundJobRunner } from "../background";

/**
 * WHAT SURVIVES THE HARNESS, AND HOW WE FIND IT (MIN-293).
 *
 * ## The measured fact that makes this file necessary
 *
 * The opencode server is started by `spawn` ordinary
 * ([opencode-host.ts](opencode-host.ts)), and the accompanying comment says
 * "the child dies with us". **It's true of the happy path and false of the rest**
 *: on POSIX, a child is not killed when its parent dies, it is repaired.
 * What kills it today is the `finally` of the supervisor — so nothing of the
 * everything when the harness is killed outright (⌘Q, crash of the main process, `SIGKILL`).
 *
 * What then remains: 143 MB in memory, the port of the held turn, and **the following turn
 * which fails on a refused `listen`** — in a place that looks nothing like it in
 * cause. The background jobs of the model are even worse: they go to
 * `setsid`, **explicitly to survive the shell**, and the `npm run dev` they
 * guard port 3000 with nothing anywhere knowing where to find it.
 *
 * In a microVM, none of this matters: the machine dies at the end of the
 * turn. On a Mac, it's junk that accumulates in someone's session.
 *
 *
 * ## The form: a file, not a protocol
 *
 * The harness registers its long-lived children in `<harnessDir>/children.json`,
 * **before** they are used for anything, and removes them when he has
 * stopped them himself. The launcher, which wrote `job.json` in this same folder and
 * therefore knows where to look, rereads the file when a round ends — and at
 * starts the app, for those orphaned by a previous crash.
 *
 * **A file rather than a message IPC**, because the case we are dealing with is
 * precisely the one where no one speaks anymore: a process killed outright does not send
 * a farewell message. And **writes synchronously**, because an asynchronous write
 * may not have happened at the time of killing.
 *
 * ## Nothing here throws
 *
 * A full disk or a read-only folder should not drop a
 * turn: this register is what we read when it ended badly, not a reason to end badly
 *. The worst case of a failure here is before this file.
 */

/** The name of the file, under `harnessDir` — next to the job and the bundle. */
export const CHILD_REGISTRY_FILE = "children.json";

/** What a long-lived child declares about himself. */
export interface HarnessChild {
  readonly pid: number;
  /** OS process birth identity; a PID alone may be recycled. */
  readonly birth: string;
  /**
   * `opencode`: the server of the tower, which holds a port and a SQLite base.
   * `background`: a job of the model, head of its own session (`setsid`), therefore
   * a GROUP of processes — it is `-pid` that needs to be reported, not `pid`.
   */
  readonly kind: "opencode" | "background";
  /** Enough to read the register without guessing: `opencode serve --port 51234`. */
  readonly label?: string;
}

export function childRegistryPath(harnessDir: string): string {
  return `${harnessDir.replace(/\/+$/, "")}/${CHILD_REGISTRY_FILE}`;
}

/**
 * The replayed register of what is found on the disk.
 *
 * Anything that does not have the expected form disappears silently — a file
 * truncated by a hard shutdown is the ORDINARY case here, since hard stopping
 * is the reason for the file. And the nonsense pids are ruled out before
 * even gets to the killer: `0` flags the caller's entire group, `1` is
 * `launchd`, and a negative flags an entire group. None of the three can
 * come from a legitimate `spawn`, and any one would be catastrophic.
 */
export function parseChildRegistry(raw: unknown): HarnessChild[] {
  if (typeof raw !== "object" || raw === null) return [];
  const children = (raw as { children?: unknown }).children;
  if (!Array.isArray(children)) return [];
  const out: HarnessChild[] = [];
  const seen = new Set<number>();
  for (const entry of children) {
    if (typeof entry !== "object" || entry === null) continue;
    const { pid, kind, label, birth } = entry as Record<string, unknown>;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) continue;
    if (kind !== "opencode" && kind !== "background") continue;
    if (typeof birth !== "string" || !birth) continue;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({
      pid,
      birth,
      kind,
      ...(typeof label === "string" && label ? { label } : {}),
    });
  }
  return out;
}

export function serializeChildRegistry(
  children: readonly HarnessChild[],
): string {
  return `${JSON.stringify({ children }, null, 2)}\n`;
}

/** Children registered for this tour. Empty when the file is missing or lying. */
export function readHarnessChildren(harnessDir: string): HarnessChild[] {
  try {
    return parseChildRegistry(
      JSON.parse(readFileSync(childRegistryPath(harnessDir), "utf8")),
    );
  } catch {
    return [];
  }
}

/**
 * Registers a child. **Called BEFORE the child is used for anything**: a
 * process killed between its `spawn` and its registration is exactly the orphan
 * that we are trying to no longer produce.
 */
export function noteHarnessChild(
  harnessDir: string,
  child: HarnessChild,
): void {
  write(harnessDir, [
    ...readHarnessChildren(harnessDir).filter((c) => c.pid !== child.pid),
    child,
  ]);
}

/** Remove a child who has just been arrested yourself. */
export function forgetHarnessChild(harnessDir: string, pid: number): void {
  write(
    harnessDir,
    readHarnessChildren(harnessDir).filter((c) => c.pid !== pid),
  );
}

/**
 * Adds crash recovery to host background jobs without changing their tool
 * contract. A process is registered before its PID is returned to the model,
 * and removed as soon as it is observed stopped or explicitly terminated.
 */
export function registeredBackgroundRunner(
  runner: BackgroundJobRunner,
  harnessDir: string,
  birthOf: (pid: number) => string | null = processBirthMarker,
): BackgroundJobRunner {
  return {
    start: async (opts) => {
      const started = await runner.start(opts);
      const birth = birthOf(started.pid);
      if (!birth) {
        await runner.stop({ jobId: opts.jobId, pid: started.pid }).catch(() => {});
        throw new Error(
          `Background process identity could not be recorded for pid ${started.pid}`,
        );
      }
      noteHarnessChild(harnessDir, {
        pid: started.pid,
        birth,
        kind: "background",
        label: [opts.invocation.executable, ...opts.invocation.args].join(" "),
      });
      return started;
    },
    read: async (opts) => {
      const result = await runner.read(opts);
      if (!result.running) forgetHarnessChild(harnessDir, opts.pid);
      return result;
    },
    stop: async (opts) => {
      try {
        await runner.stop(opts);
      } finally {
        forgetHarnessChild(harnessDir, opts.pid);
      }
    },
  };
}

/**
 * THE PIDS WE HAVE THE RIGHT TO KILL, and in what order.
 *
 * Pure, and tested, because this is the only part where a mistake has consequences
 * that we cannot make up for: a `process.kill` on the wrong number kills something
 * something from someone's session.
 *
 * - **never yourself**, nor the parent: a corrupted registry carrying the pid
 * of the main process would cause the app to quit thinking it was cleaning;
 * - **background jobs first**: there are more and more of them volatile, and the
 * opencode server is what blocks the next round — we want him to die in
 * last, when the rest has already let go of what he was holding;
 * - **a `background` is reported in a GROUP** (`-pid`), because he has left en
 * `setsid`: Killing the lone leader would leave the `npm run dev` he cast.
 */
export function killTargets(
  children: readonly HarnessChild[],
  self: { pid: number; ppid?: number },
  birthOf: (pid: number) => string | null = processBirthMarker,
): Array<{ signalTo: number; kind: HarnessChild["kind"]; label?: string }> {
  const forbidden = new Set(
    [self.pid, self.ppid].filter((v): v is number => typeof v === "number"),
  );
  const order = { background: 0, opencode: 1 } as const;
  return children
    .filter(
      (child) =>
        !forbidden.has(child.pid) && birthOf(child.pid) === child.birth,
    )
    .slice()
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((child) => ({
      signalTo: child.kind === "background" ? -child.pid : child.pid,
      kind: child.kind,
      ...(child.label ? { label: child.label } : {}),
    }));
}

/** Stable process identity from the OS, or null when it cannot be proved. */
export function processBirthMarker(pid: number): string | null {
  try {
    // Linux field 22 is the start time in clock ticks since boot. The command
    // name may contain spaces and parentheses, so split after its final `)`.
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat
      .slice(stat.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    const startTicks = fields[19];
    if (startTicks) return `linux:${startTicks}`;
  } catch {
    // macOS and other POSIX hosts do not expose /proc.
  }
  try {
    const started = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return started ? `ps:${started}` : null;
  } catch {
    return null;
  }
}

function write(harnessDir: string, children: readonly HarnessChild[]): void {
  try {
    mkdirSync(harnessDir, { recursive: true });
    writeFileSync(
      childRegistryPath(harnessDir),
      serializeChildRegistry(children),
      "utf8",
    );
  } catch (error) {
    console.error("[child-registry] inscription impossible", error);
  }
}
