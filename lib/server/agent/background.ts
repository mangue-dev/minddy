import { headTail } from "./prune";

/**
 * Agent BACKGROUND jobs (MIN-114). `run_command` is BLOCKING: it waits for
 * to finish the command, then kills it. The agent could therefore not launch a de
 * dev server — therefore never check that a page renders or that a route responds. It checked
 * what fits in a `exit 0`, or nothing.
 *
 * We take the 20% which carries the capacity — **start, probe, stop** — and
 * not the Codex PTY session shell: an interactive session would not survive neither
 * to suspend/resume nor to stop the microVM by the reaper, and the interactivity
 * only serves a human in front of a terminal.
 *
 * This module is pure: the resource ceiling, offsets, and formatting are testable without
 * microVM; hands in the sandbox are behind `BackgroundJobRunner`, hardwired
 * into `execute.ts`. The register lives for ONE chunk: a job does not survive
 * one suspends, and the end of the round kills them all (`stopAll`).
 */

/** Concurrent LIVE jobs. Beyond that, `start` refuses — an agent that stacks the
 * servers has lost track, and the microVM is small. */
export const MAX_BACKGROUND_JOBS = 3;

/** Bytes taken from the microVM at each `check` (the TAIL of the increment). Beyond that,
 * the missing middle remains readable in the log, on disk. */
export const BACKGROUND_FETCH_BYTES = 32_000;

/** Output characters returned to the model by `check` (head + tail). */
export const BACKGROUND_OUTPUT_CAP = 3000;

/**
 * WHERE IS THE COMPLETE LOG, AND HOW TO READ IT — the only sentence in this module which
 * depends on the engine (MIN-286, batch 3).
 *
 * The log lives in `TOOL_OUTPUT_DIR`, therefore **outside the repository** (the `git add -A` of
 * end of turn must never see it). At the house loop, `read_file` and
 * `grep` go there: they are our tools, and they read what we tell them. At
 * OpenCode, the shell is the portable way to read an absolute log path.
 */
export interface BackgroundLogNotes {
  /** The starting note phrase. */
  full(logPath: string): string;
  /** That of the elision note: read the file rather than resound. */
  insteadOfPolling(logPath: string): string;
}

/** Home loop tools — the original text, to the word. */
export const LOOP_BACKGROUND_LOG_NOTES: BackgroundLogNotes = {
  full: (p) => `The complete log is at ${p} (readable with read_file and grep)`,
  insteadOfPolling: (p) =>
    `The complete log is at ${p} — grep it or read_file it with offset/limit instead of polling again.`,
};

/** At opencode: the file is outside the repository, so it is the SHELL that reads it. */
export const OPENCODE_BACKGROUND_LOG_NOTES: BackgroundLogNotes = {
  full: (p) =>
    `The complete log is at ${p} — it is outside the repository, so read it with bash (\`tail -n 200 ${p}\`, \`grep -n <pattern> ${p}\`) rather than with read`,
  insteadOfPolling: (p) =>
    `The complete log is at ${p} — it is outside the repository: read it with bash (\`grep -n <pattern> ${p}\`, \`tail -n 200 ${p}\`) instead of polling again.`,
};

/** What the sandbox returns when starting a job. */
export interface BackgroundStarted {
  pid: number;
  logPath: string;
}

/** What the sandbox returns to each probe. */
export interface BackgroundChunk {
  /** Bytes written from `offset` (at most `BACKGROUND_FETCH_BYTES`, taken at the end). */
  chunk: string;
  /** New offset = size of the log (we skip what we didn't draw). */
  nextOffset: number;
  running: boolean;
  /** Exit code if the process is terminated, otherwise null. */
  exitCode: number | null;
  /** Increment bytes not drawn (too large) — they remain in the log. */
  skippedBytes: number;
}

// ── The shell of a job (PUR: this is the risky part, it must be readable) ──

/** The three files of a job in the microVM (paths calculated by `sandbox.ts`). */
export interface BackgroundPaths {
  /** Job stdout + stderr. */
  log: string;
  /** PID, written by the job itself. */
  pid: string;
  /** Exit code, written when the command returns. */
  exit: string;
}

/** Probe header: first line of its output, the rest is the log. */
export const BACKGROUND_PROBE_HEADER = "__MDY_BG__";

/** Safe quote to insert a value in a `sh -c` command (twin of
 * that of `sandbox.ts` — this module remains pure, it does not import anything from the server). */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A background command after the untrusted shell string has been reduced to data. */
export interface BackgroundInvocation {
  executable: string;
  args: string[];
  env: Record<string, string>;
}

export type BackgroundCommandVerdict =
  | { allowed: true; invocation: BackgroundInvocation }
  | { allowed: false; reason: string };

export type BackgroundInvocationVerdict =
  { allowed: true } | { allowed: false; reason: string };

export interface BackgroundCommandScope {
  local?: boolean;
}

const BACKGROUND_INVALID_COMMAND_REASON = "background_command_invalid";

function backgroundRefusal(detail: string): BackgroundCommandVerdict {
  return {
    allowed: false,
    reason: `Refused background command — ${detail}.`,
  };
}

/** Convert the public command into the shell invocation OpenCode requested. */
export function parseBackgroundCommand(
  command: string,
  _scope: BackgroundCommandScope = {},
): BackgroundCommandVerdict {
  if (!command.trim()) return backgroundRefusal("the command is empty");
  if (command.includes("\0"))
    return backgroundRefusal("NUL bytes are not valid command data");
  return {
    allowed: true,
    invocation: { executable: "sh", args: ["-lc", command], env: {} },
  };
}

/** Validate only the transport shape before launching the requested command. */
export function checkBackgroundInvocation(
  invocation: BackgroundInvocation,
  _scope: BackgroundCommandScope = {},
): BackgroundInvocationVerdict {
  const { executable, args, env } = invocation;
  const allowed =
    typeof executable === "string" &&
    executable.length > 0 &&
    !executable.includes("\0") &&
    args.every((arg) => typeof arg === "string" && !arg.includes("\0")) &&
    Object.entries(env).every(
      ([name, value]) =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
        typeof value === "string" &&
        !value.includes("\0"),
    );
  return allowed
    ? { allowed: true }
    : {
        allowed: false,
        reason: "Refused background command with invalid argument data.",
      };
}

/**
 * Test whether a job is alive by the process STATE rather than `kill -0`: PID 1
 * in the microVM does not reap its orphans, so a dead job remains a ZOMBIE — and
 * `kill -0` succeeds for a zombie. Measured: without this, a server that had
 * just crashed was reported as “still running” forever, the exact opposite of
 * a useful signal.
 */
function aliveFn(pid: number): string {
  return `bg_alive() { s=$(ps -o stat= -p ${pid} 2>/dev/null | tr -d ' '); case "$s" in ""|Z*) return 1;; *) return 0;; esac; }`;
}

/**
 * LAUNCH script. Three precautions make the whole setup work:
 *  - `setsid`: the job becomes the leader of its own SESSION, so its PID is also
 *    its PGID. It survives the shell that launched it, and stopping can target
 *    the GROUP (an `npm run dev` launches a child; killing only the parent would
 *    leave the port occupied).
 *  - redirections: stdout/stderr go to the log, and stdin comes from /dev/null —
 *    otherwise the job would keep the launcher's pipes open and the call would
 *    wait for it to finish, exactly what we are trying to avoid.
 *  - the PID is written BY the job (`echo $$`), not read from `$!`: depending on
 *    whether `setsid` forks, `$!` refers to one process or the other.
 */
export function backgroundStartScript(
  p: BackgroundPaths,
  invocation: BackgroundInvocation,
  dir: string,
): string {
  // The job body: its PID, the command, then its exit code. No `exec`: the shell
  // remains the command's parent — the probe follows it, and it writes the exit
  // code. The command runs in a SUBSHELL: without the parentheses, an `exit 3`
  // (or a failing `set -e`) would exit the job shell before the exit-code line,
  // which we would then never see.
  const environment = Object.entries(invocation.env).map(
    ([name, value]) => `${name}=${sq(value)}`,
  );
  /**
   * Do not inherit the supervisor/opencode environment. It contains service
   * addresses and short-lived control material that a development process does
   * not need. Repository programs receive only ordinary process basics plus the
   * explicitly allowlisted overrides parsed above.
   */
  const cleanEnvironment = [
    `HOME="$HOME"`,
    'LANG="${LANG:-C.UTF-8}"',
    'LC_ALL="${LC_ALL:-}"',
    'LOGNAME="${LOGNAME:-}"',
    'PATH="${PATH:-/usr/local/bin:/usr/bin:/bin}"',
    'TERM="${TERM:-dumb}"',
    'TMPDIR="${TMPDIR:-/tmp}"',
    'USER="${USER:-}"',
    ...environment,
  ];
  const execute = `env -i ${cleanEnvironment.join(" ")} -- "$@"`;
  const inner = [
    `echo $$ > ${sq(p.pid)}`,
    `( ${execute}\n)`,
    `echo $? > ${sq(p.exit)}`,
  ].join("\n");
  const argv = [invocation.executable, ...invocation.args].map(sq).join(" ");
  return [
    `mkdir -p ${sq(dir)}`,
    `rm -f ${sq(p.pid)} ${sq(p.exit)}`,
    `: > ${sq(p.log)}`,
    `if command -v setsid >/dev/null 2>&1; then`,
    `  setsid sh -c ${sq(inner)} minddy-background ${argv} > ${sq(p.log)} 2>&1 < /dev/null &`,
    `else`,
    `  sh -c ${sq(inner)} minddy-background ${argv} > ${sq(p.log)} 2>&1 < /dev/null &`,
    `fi`,
    // The job writes its PID on its first line: a few tenths of a second is enough.
    `i=0`,
    `while [ "$i" -lt 50 ] && [ ! -s ${sq(p.pid)} ]; do sleep 0.1; i=$((i+1)); done`,
    `cat ${sq(p.pid)} 2>/dev/null`,
  ].join("\n");
}

/**
 * PROBE script: a header (log size, alive?, exit code), followed by the bytes
 * written since `offset`, capped at `maxBytes` taken from the END — a chatty
 * watcher must not return 40 MB per probe. `wc -c` fixes the size BEFORE reading
 * so that the returned offset corresponds exactly to what was truncated.
 */
export function backgroundProbeScript(
  p: BackgroundPaths,
  pid: number,
  offset: number,
  maxBytes: number,
): string {
  const from = Math.max(0, Math.floor(offset));
  const cap = Math.max(1, Math.floor(maxBytes));
  return [
    aliveFn(pid),
    `size=$(wc -c < ${sq(p.log)} 2>/dev/null | tr -d ' ')`,
    `[ -n "$size" ] || size=0`,
    `if bg_alive; then running=1; else running=0; fi`,
    `code=$(tr -d ' \\n' < ${sq(p.exit)} 2>/dev/null)`,
    `[ -n "$code" ] || code=-`,
    `echo "${BACKGROUND_PROBE_HEADER} $size $running $code"`,
    `if [ "$size" -gt ${from} ]; then`,
    `  tail -c +${from + 1} ${sq(p.log)} 2>/dev/null | head -c $((size - ${from})) | tail -c ${cap}`,
    `fi`,
  ].join("\n");
}

/**
 * STOP script: SIGTERM, a grace period, then SIGKILL. Targets the process GROUP
 * when the PID is its leader (the normal case; see `setsid`) — otherwise an
 * `npm run dev` would leave its child, and its port, behind. Always exits 0: an
 * already-dead process is not an error.
 */
export function backgroundStopScript(pid: number): string {
  return [
    aliveFn(pid),
    `pgid=$(ps -o pgid= -p ${pid} 2>/dev/null | tr -d ' ')`,
    `if [ "$pgid" = "${pid}" ]; then target="-${pid}"; else target="${pid}"; fi`,
    `kill -TERM $target 2>/dev/null`,
    `i=0`,
    `while [ "$i" -lt 30 ] && bg_alive; do sleep 0.1; i=$((i+1)); done`,
    `if bg_alive; then kill -KILL $target 2>/dev/null; fi`,
    `exit 0`,
  ].join("\n");
}

/**
 * Reads the probe output. The first line is the header, and everything else is
 * the log — a log containing the header itself therefore fools nobody.
 */
export function parseBackgroundProbe(
  stdout: string,
  opts: { offset: number; maxBytes: number },
): BackgroundChunk {
  const nl = stdout.indexOf("\n");
  const header = (nl >= 0 ? stdout.slice(0, nl) : stdout).trim().split(/\s+/);
  if (header[0] !== BACKGROUND_PROBE_HEADER) {
    throw new Error("the background job could not be probed");
  }
  const size = Number.parseInt(header[1] ?? "", 10);
  const nextOffset = Number.isInteger(size) && size >= 0 ? size : opts.offset;
  const running = header[2] === "1";
  const exitCode = Number.parseInt(header[3] ?? "", 10);
  return {
    chunk: nl >= 0 ? stdout.slice(nl + 1) : "",
    nextOffset,
    running,
    // A live job has no exit code; a job killed by SIGKILL has none either.
    exitCode: running || !Number.isInteger(exitCode) ? null : exitCode,
    skippedBytes: Math.max(0, nextOffset - opts.offset - opts.maxBytes),
  };
}

/** The microVM hands (implemented by `sandbox.ts`, wired by `execute.ts`). */
export interface BackgroundJobRunner {
  start(opts: {
    jobId: string;
    invocation: BackgroundInvocation;
    workdir?: string;
  }): Promise<BackgroundStarted>;
  read(opts: {
    jobId: string;
    pid: number;
    offset: number;
  }): Promise<BackgroundChunk>;
  stop(opts: { jobId: string; pid: number }): Promise<void>;
}

interface Job {
  jobId: string;
  command: string;
  pid: number;
  logPath: string;
  /** Bytes already returned to the model (or skipped): `check` returns the INCREMENT. */
  offset: number;
  /** Has the process exited (as observed by a probe)? */
  exited: boolean;
  exitCode: number | null;
}

/** Shape of a tool result (identical to the `ExecuteAgentTool` contract). */
interface ToolOutcome {
  result: unknown;
  success: boolean;
  reason?: string;
}

function fail(error: string, reason?: string): ToolOutcome {
  return { result: { error }, success: false, ...(reason ? { reason } : {}) };
}

/** Could the job still consume the microVM? */
function isLive(job: Job): boolean {
  return !job.exited;
}

export class BackgroundJobs {
  private readonly jobs = new Map<string, Job>();
  private seq = 0;

  /**
   * @param runner  the microVM hands
   * @param seqBase base for job numbers, partitioned by continuation (like the
   *                other run counters): two chunks do not reuse the same log
   *                filename.
   */
  constructor(
    private readonly runner: BackgroundJobRunner,
    private readonly seqBase = 0,
    /** How to TELL the model to read the complete log — see `BackgroundLogNotes`. */
    private readonly notes: BackgroundLogNotes = LOOP_BACKGROUND_LOG_NOTES,
    /** Execution context retained for protocol compatibility and audit metadata. */
    private readonly scope: BackgroundCommandScope = {},
  ) {}

  /** Executes a `run_background` call. Never throws: everything returns to the
   *  model as a tool result, whether successful or an error. */
  async handle(args: Record<string, unknown>): Promise<ToolOutcome> {
    const action = String(args.action ?? "").trim();
    switch (action) {
      case "start":
        return await this.start(args);
      case "check":
        return await this.check(args);
      case "stop":
        return await this.stop(args);
      default:
        return fail(
          `Unknown action ${JSON.stringify(action)} — use "start", "check" or "stop".`,
        );
    }
  }

  /** Kills all live jobs. Best effort, never throws. Called before each push (a
   *  watcher writing during `git add -A` would commit anything at all) and at the
   *  end of the chunk. Returns the number of killed jobs. */
  async stopAll(): Promise<number> {
    const live = [...this.jobs.values()].filter(isLive);
    await Promise.all(
      live.map(async (job) => {
        await this.runner
          .stop({ jobId: job.jobId, pid: job.pid })
          .catch(() => {});
        job.exited = true;
      }),
    );
    return live.length;
  }

  /** Jobs still alive (diagnostics / end of turn). */
  liveCount(): number {
    return [...this.jobs.values()].filter(isLive).length;
  }

  private async start(args: Record<string, unknown>): Promise<ToolOutcome> {
    const command = String(args.command ?? "").trim();
    if (!command) return fail("command is required to start a background job.");

    // Convert the public string to a static argv before reserving or launching a
    // job. The runner receives no shell program supplied by the model.
    const verdict = parseBackgroundCommand(command, this.scope);
    if (!verdict.allowed)
      return fail(verdict.reason, BACKGROUND_INVALID_COMMAND_REASON);

    const live = [...this.jobs.values()].filter(isLive);
    if (live.length >= MAX_BACKGROUND_JOBS) {
      return fail(
        `Too many background jobs (${live.length}/${MAX_BACKGROUND_JOBS}). Stop one first: ` +
          live.map((j) => `${j.jobId} (${j.command})`).join(", "),
      );
    }

    const jobId = `bg-${this.seqBase + ++this.seq}`;
    // Reserve BEFORE the await: tool calls in a round run in parallel, so two
    // simultaneous `start` calls would otherwise both pass under the ceiling.
    const job: Job = {
      jobId,
      command,
      pid: 0,
      logPath: "",
      offset: 0,
      exited: false,
      exitCode: null,
    };
    this.jobs.set(jobId, job);

    try {
      const started = await this.runner.start({
        jobId,
        invocation: verdict.invocation,
        workdir:
          args.workdir != null && String(args.workdir).trim() !== ""
            ? String(args.workdir)
            : undefined,
      });
      job.pid = started.pid;
      job.logPath = started.logPath;
    } catch (err) {
      this.jobs.delete(jobId);
      return fail(err instanceof Error ? err.message : String(err));
    }

    return {
      result: {
        job_id: jobId,
        pid: job.pid,
        log_path: job.logPath,
        note:
          `Started in the background. Give it a moment to boot, then poll it with ` +
          `run_background {action:"check", job_id:"${jobId}"} — each check returns only what was ` +
          `written since the previous one. ${this.notes.full(job.logPath)}. Stop it with ` +
          `{action:"stop"} as soon as you are done; every background job is killed at the end of ` +
          `this turn anyway.`,
      },
      success: true,
    };
  }

  private async check(args: Record<string, unknown>): Promise<ToolOutcome> {
    const job = this.jobs.get(String(args.job_id ?? "").trim());
    if (!job) return fail(this.unknownJob(String(args.job_id ?? "")));

    // Probe even a job already known to be dead: its final output (the stack trace
    // that killed it) may not have been read yet.
    let read: BackgroundChunk;
    try {
      read = await this.runner.read({
        jobId: job.jobId,
        pid: job.pid,
        offset: job.offset,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    job.offset = read.nextOffset;
    job.exited = !read.running;
    job.exitCode = read.exitCode;

    const output = headTail(read.chunk, BACKGROUND_OUTPUT_CAP);
    const elided = read.skippedBytes > 0 || output !== read.chunk;
    return {
      result: {
        job_id: job.jobId,
        command: job.command,
        running: read.running,
        ...(read.running ? {} : { exit_code: read.exitCode }),
        output: read.chunk ? output : "(nothing new since the last check)",
        log_path: job.logPath,
        ...(elided
          ? {
              note:
                `Output since the last check was too long to show in full` +
                (read.skippedBytes > 0
                  ? ` (${read.skippedBytes} bytes were skipped)`
                  : "") +
                `. ${this.notes.insteadOfPolling(job.logPath)}`,
            }
          : {}),
      },
      // Same rule as `run_command`: a dead job with a nonzero exit code is a failure.
      success: read.exitCode == null || read.exitCode === 0,
    };
  }

  private async stop(args: Record<string, unknown>): Promise<ToolOutcome> {
    const job = this.jobs.get(String(args.job_id ?? "").trim());
    if (!job) return fail(this.unknownJob(String(args.job_id ?? "")));
    if (job.exited) {
      return {
        result: {
          job_id: job.jobId,
          stopped: false,
          note: `Job ${job.jobId} had already exited (exit code ${job.exitCode ?? "unknown"}). Its log is at ${job.logPath}.`,
        },
        success: true,
      };
    }
    try {
      await this.runner.stop({ jobId: job.jobId, pid: job.pid });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
    job.exited = true;
    return {
      result: {
        job_id: job.jobId,
        stopped: true,
        log_path: job.logPath,
        note: `Job ${job.jobId} was killed. Its complete output stays readable at ${job.logPath}.`,
      },
      success: true,
    };
  }

  /** Message for an unknown `job_id`: the most common cause is a previous turn —
   *  jobs do not survive a turn, and the model must read this. */
  private unknownJob(jobId: string): string {
    const live = [...this.jobs.values()].filter(isLive).map((j) => j.jobId);
    return (
      `No background job ${JSON.stringify(jobId)} here — background jobs do not survive a turn (every ` +
      `one of them is killed when the turn ends, and a very long turn may drop them earlier), and a ` +
      `stopped job cannot be resumed. ` +
      (live.length
        ? `Jobs running right now: ${live.join(", ")}.`
        : `Nothing is running right now — start what you need again with {action:"start"}.`)
    );
  }
}
