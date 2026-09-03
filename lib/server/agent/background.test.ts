import { describe, expect, it } from "vitest";
import {
  BackgroundJobs,
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  checkBackgroundInvocation,
  parseBackgroundCommand,
  parseBackgroundProbe,
  BACKGROUND_OUTPUT_CAP,
  BACKGROUND_PROBE_HEADER,
  MAX_BACKGROUND_JOBS,
  OPENCODE_BACKGROUND_LOG_NOTES,
  type BackgroundChunk,
  type BackgroundJobRunner,
} from "./background";
import { layoutForRoot } from "./harness-layout";
import { startBackground, type RepoHost } from "./repo-host";

/**
 * Background jobs (MIN-114). These tests cover lifecycle and transport: the
 * explicit job ceiling, incremental output, and the message for a missing job.
 * Command method belongs to OpenCode rather than an application parser. Hands in the
 * microVM are behind a fake runner.
 */

/** False process: what it wrote, if it is still running, its exit code. */
interface FakeProc {
  log: string;
  running: boolean;
  exitCode: number | null;
  killed: number;
}

function fakeRunner() {
  const procs = new Map<string, FakeProc>();
  const starts: Array<{
    jobId: string;
    invocation: {
      executable: string;
      args: string[];
      env: Record<string, string>;
    };
    workdir?: string;
  }> = [];
  let nextPid = 100;
  const byPid = new Map<number, string>();

  const runner: BackgroundJobRunner = {
    async start({ jobId, invocation, workdir }) {
      starts.push({ jobId, invocation, workdir });
      const pid = nextPid++;
      procs.set(jobId, { log: "", running: true, exitCode: null, killed: 0 });
      byPid.set(pid, jobId);
      return { pid, logPath: `/vercel/sandbox/tool-output/${jobId}.log` };
    },
    async read({ jobId, offset }): Promise<BackgroundChunk> {
      const proc = procs.get(jobId)!;
      const maxBytes = 32;
      const increment = proc.log.length - offset;
      // Like the sandbox: we only draw the TAIL of the increment, and the offset
      // still advance to the end of the log.
      const chunk =
        increment > 0
          ? proc.log.slice(Math.max(offset, proc.log.length - maxBytes))
          : "";
      return {
        chunk,
        nextOffset: proc.log.length,
        running: proc.running,
        exitCode: proc.running ? null : proc.exitCode,
        skippedBytes: Math.max(0, increment - maxBytes),
      };
    },
    async stop({ pid }) {
      const proc = procs.get(byPid.get(pid) ?? "");
      if (proc) {
        proc.running = false;
        proc.killed++;
      }
    },
  };

  return { runner, procs, starts };
}

const asRecord = (r: unknown) => r as Record<string, unknown>;

const paths = {
  log: "/vercel/sandbox/tool-output/bg-1.log",
  pid: "/vercel/sandbox/tool-output/bg-1.pid",
  exit: "/vercel/sandbox/tool-output/bg-1.exit",
};

describe("a job's lifecycle shell", () => {
  it("detaches the job, redirects its streams, and lets the job write its PID", () => {
    const script = backgroundStartScript(
      paths,
      { executable: "npm", args: ["run", "dev"], env: {} },
      "/vercel/sandbox/tool-output",
    );
    expect(script).toContain("setsid sh -c");
    expect(script).toContain("if set -m 2>/dev/null; then");
    expect(script).toContain(
      "Could not create a process group for the background job",
    );
    // stdin closed: a job waiting for an entry would die instead of holding the
    // microVM; stdout/stderr in the log, otherwise the launcher would wait for its end.
    expect(script).toMatch(
      /> '\/vercel\/sandbox\/tool-output\/bg-1\.log' 2>&1 < \/dev\/null &/,
    );
    expect(script).toContain("echo $$ >");
    expect(script).toContain("echo $? >");
    expect(script).not.toContain("$!");
    expect(script).toContain('"$@"');
    expect(script).toContain("minddy-background 'npm' 'run' 'dev'");
    expect(script).toContain("env -i");
    expect(script).not.toContain("OPENCODE_CONFIG_CONTENT");
    expect(script).not.toContain("SUPERVISOR_TOKEN");
  });

  it("passes quoted arguments as positional data instead of shell source", () => {
    const script = backgroundStartScript(
      paths,
      { executable: "node", args: ["server.js", "it's alive; $(id)"], env: {} },
      "/tmp",
    );
    expect(script).toContain(`'it'\\''s alive; $(id)'`);
    expect(script.match(/setsid sh -c '/g)).toHaveLength(1);
    expect(script).not.toContain(`( node server.js`);
  });

  it("runs argv in a subshell so it always records the exit code", () => {
    const script = backgroundStartScript(
      paths,
      { executable: "npm", args: ["run", "dev"], env: { CI: "1" } },
      "/tmp",
    );
    expect(script).toContain("( env -i ");
    expect(script).toContain("CI=");
    expect(script).toContain(`-- "$@"`);
    expect(script).toContain("echo $? >");
  });

  it("probes from the offset and caps the incremental output from the tail", () => {
    const script = backgroundProbeScript(paths, 4242, 100, 32_000);
    expect(script).toContain("tail -c +101");
    expect(script).toContain("head -c $((size - 100))");
    expect(script).toContain("tail -c 32000");
    expect(script).toContain(
      `echo "${BACKGROUND_PROBE_HEADER} $size $running $code"`,
    );
  });

  it("checks job liveness from its STATE instead of `kill -0`", () => {
    // The microVM's PID 1 does not reap children: a dead job remains a ZOMBIE,
    // and `kill -0` succeeds for it, so a crashed server would appear to be running.
    for (const script of [
      backgroundProbeScript(paths, 4242, 0, 100),
      backgroundStopScript(4242),
    ]) {
      expect(script).toContain("ps -o stat= -p 4242");
      expect(script).toContain(`""|Z*) return 1`);
      expect(script).not.toContain("kill -0");
    }
  });

  it("stops the process GROUP only when the PID is its leader", () => {
    const script = backgroundStopScript(4242);
    expect(script).toContain("ps -o pgid= -p 4242");
    expect(script).toContain(
      `if [ "$pgid" = "4242" ]; then target="-4242"; else target="4242"; fi`,
    );
    expect(script).toContain("kill -TERM $target");
    expect(script).toContain("kill -KILL $target");
    // A process that is already dead is not a tool error.
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });
});

describe("probe parsing", () => {
  it("separates the header from the log even when the log contains the header", () => {
    const stdout = `${BACKGROUND_PROBE_HEADER} 120 1 -\nready\n${BACKGROUND_PROBE_HEADER} fake\n`;
    const read = parseBackgroundProbe(stdout, {
      offset: 100,
      maxBytes: 32_000,
    });
    expect(read.chunk).toBe(`ready\n${BACKGROUND_PROBE_HEADER} fake\n`);
    expect(read.nextOffset).toBe(120);
    expect(read.running).toBe(true);
    expect(read.exitCode).toBeNull();
    expect(read.skippedBytes).toBe(0);
  });

  it("returns a completed job's exit code and counts skipped bytes", () => {
    const read = parseBackgroundProbe(
      `${BACKGROUND_PROBE_HEADER} 90000 0 1\nboom\n`,
      {
        offset: 0,
        maxBytes: 32_000,
      },
    );
    expect(read.running).toBe(false);
    expect(read.exitCode).toBe(1);
    expect(read.skippedBytes).toBe(58_000);
  });

  it("does not assign an exit code to a running job", () => {
    const read = parseBackgroundProbe(
      `${BACKGROUND_PROBE_HEADER} 10 1 0\nhi\n`,
      {
        offset: 0,
        maxBytes: 32_000,
      },
    );
    expect(read.exitCode).toBeNull();
  });

  it("throws when the probe did not respond", () => {
    expect(() =>
      parseBackgroundProbe("sh: 1: kill: not found\n", {
        offset: 0,
        maxBytes: 10,
      }),
    ).toThrow();
  });
});

describe("run_background — static command boundary", () => {
  it("passes the requested shell command without application-level parsing", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({
      action: "start",
      command: "npm run dev & git reset --hard",
      workdir: "apps/web",
    });
    expect(out.success).toBe(true);
    expect(starts).toEqual([
      {
        jobId: "bg-1",
        invocation: {
          executable: "sh",
          args: ["-lc", "npm run dev & git reset --hard"],
          env: {},
        },
        workdir: "apps/web",
      },
    ]);
    expect(asRecord(out.result).job_id).toBe("bg-1");
    expect(String(asRecord(out.result).log_path)).toContain("bg-1.log");
  });

  it("preserves shell syntax as data for the shell invocation", () => {
    const verdict = parseBackgroundCommand(
      `CI=1 PORT='3000' npm run dev -- --hostname "127.0.0.1"`,
    );
    expect(verdict).toEqual({
      allowed: true,
      invocation: {
        executable: "sh",
        args: ["-lc", `CI=1 PORT='3000' npm run dev -- --hostname "127.0.0.1"`],
        env: {},
      },
    });
  });

  it("validates transport data instead of command intent", () => {
    expect(
      checkBackgroundInvocation({
        executable: "sh",
        args: ["-c", "git push"],
        env: {},
      }).allowed,
    ).toBe(true);
    expect(
      checkBackgroundInvocation({
        executable: "sh",
        args: ["-c", "bad\0data"],
        env: {},
      }).allowed,
    ).toBe(false);
  });

  it("allows a host-backed repository to launch a background process", async () => {
    let executions = 0;
    const host: RepoHost = {
      layout: layoutForRoot("/Users/example/project", "/opt/opencode"),
      processIsolation: "host",
      exec: async () => {
        executions++;
        return { exitCode: 0, stdout: "123\n", stderr: "" };
      },
      readFile: async () => null,
      writeFile: async () => {},
      mkdir: async () => {},
    };
    await expect(
      startBackground(host, {
        jobId: "bg-host",
        invocation: { executable: "npm", args: ["run", "dev"], env: {} },
      }),
    ).resolves.toMatchObject({ pid: 123 });
    expect(executions).toBe(1);
  });
});

describe("run_background — job ceiling", () => {
  it(`refuses more than ${MAX_BACKGROUND_JOBS} running jobs and names active jobs`, async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (let i = 0; i < MAX_BACKGROUND_JOBS; i++) {
      expect(
        (await jobs.handle({ action: "start", command: `sleep ${i}` })).success,
      ).toBe(true);
    }
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(
      /Too many background jobs/,
    );
    expect(String(asRecord(out.result).error)).toContain("bg-1");
  });

  it("releases a slot as soon as a job stops", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (let i = 0; i < MAX_BACKGROUND_JOBS; i++) {
      await jobs.handle({ action: "start", command: `sleep ${i}` });
    }
    expect(
      (await jobs.handle({ action: "stop", job_id: "bg-1" })).success,
    ).toBe(true);
    expect(jobs.liveCount()).toBe(MAX_BACKGROUND_JOBS - 1);
    expect(
      (await jobs.handle({ action: "start", command: "npm run dev" })).success,
    ).toBe(true);
  });

  it("reserves slots before launch so concurrent starts cannot exceed the ceiling", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    // The tool-calls of a round go to Promise.all — the ceiling must hold.
    const outs = await Promise.all(
      Array.from({ length: MAX_BACKGROUND_JOBS + 2 }, (_, i) =>
        jobs.handle({ action: "start", command: `sleep ${i}` }),
      ),
    );
    expect(outs.filter((o) => o.success)).toHaveLength(MAX_BACKGROUND_JOBS);
    expect(starts).toHaveLength(MAX_BACKGROUND_JOBS);
  });
});

describe("run_background — incremental `check` output", () => {
  it("returns only output written since the previous probe", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run dev" });

    procs.get("bg-1")!.log = "ready on :3000\n";
    const first = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(asRecord(first.result).output).toContain("ready on :3000");
    expect(asRecord(first.result).running).toBe(true);

    procs.get("bg-1")!.log += "GET / 200\n";
    const second = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(asRecord(second.result).output).toBe("GET / 200\n");
    expect(asRecord(second.result).output).not.toContain("ready on :3000");

    const third = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(String(asRecord(third.result).output)).toMatch(/nothing new/i);
  });

  it("caps a noisy watcher and points to the complete log", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run watch" });
    procs.get("bg-1")!.log = "x".repeat(500_000);

    const out = await jobs.handle({ action: "check", job_id: "bg-1" });
    const result = asRecord(out.result);
    expect(String(result.output).length).toBeLessThanOrEqual(
      BACKGROUND_OUTPUT_CAP,
    );
    expect(String(result.note)).toContain("bg-1.log");
    expect(String(result.note)).toMatch(/bytes were skipped/);
    // The offset has progressed well to the end: the next probe does not replay everything.
    const next = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(String(asRecord(next.result).output)).toMatch(/nothing new/i);
  });

  it("reports a dead job with its exit code and a false success value", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run dev" });
    Object.assign(procs.get("bg-1")!, {
      running: false,
      exitCode: 1,
      log: "EADDRINUSE\n",
    });

    const out = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(asRecord(out.result).running).toBe(false);
    expect(asRecord(out.result).exit_code).toBe(1);
    expect(asRecord(out.result).output).toContain("EADDRINUSE");
    expect(out.success).toBe(false);
    // A dead job no longer occupies a slot.
    expect(jobs.liveCount()).toBe(0);
  });
});

/**
 * MIN-286 batch 3 — the complete log lives OUTSIDE the repository (the `git add -A` at the end of
 * should never see it), and the two engines do not access it the same: at
 * opencode, a read outside the repository publishes `external_directory`, which the harness
 * DENIED. Sending the model there to read with `read` would be sending it against a wall
 * that we hold ourselves — and sending it to `read_file`, a tool that does not exist
 * there.
 */
describe("run_background — complete log location by engine", () => {
  it("directs the built-in loop to `read_file` and `grep`", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(String(asRecord(out.result).note)).toContain(
      "readable with read_file and grep",
    );
  });

  it("directs OpenCode to its SHELL instead of `read`", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner, 0, OPENCODE_BACKGROUND_LOG_NOTES);
    const started = await jobs.handle({
      action: "start",
      command: "npm run dev",
    });
    const note = String(asRecord(started.result).note);
    expect(note).toContain("outside the repository");
    expect(note).toContain("read it with bash");
    expect(note).not.toContain("read_file");

    procs.get("bg-1")!.log = "x".repeat(500_000);
    const checked = await jobs.handle({ action: "check", job_id: "bg-1" });
    const elision = String(asRecord(checked.result).note);
    expect(elision).toContain("read it with bash");
    expect(elision).not.toContain("read_file");
  });
});

describe("run_background — jobs from another turn", () => {
  it("explains that an unknown job ID does not survive the turn", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (const action of ["check", "stop"] as const) {
      const out = await jobs.handle({ action, job_id: "bg-7" });
      expect(out.success).toBe(false);
      expect(String(asRecord(out.result).error)).toMatch(
        /do not survive a turn/i,
      );
    }
  });

  it("numbers jobs by continuation range so logs are not overwritten", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner, 2000);
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(asRecord(out.result).job_id).toBe("bg-2001");
  });

  it("refuses an unknown action", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "write_stdin", job_id: "bg-1" });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(
      /"start", "check" or "stop"/,
    );
  });
});

describe("run_background — end of turn", () => {
  it("kills every running job exactly once", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run dev" });
    await jobs.handle({ action: "start", command: "npm run watch" });

    expect(await jobs.stopAll()).toBe(2);
    expect(procs.get("bg-1")!.running).toBe(false);
    expect(procs.get("bg-2")!.running).toBe(false);
    // Idempotent: called before the push THEN in the `finally`.
    expect(await jobs.stopAll()).toBe(0);
    expect(procs.get("bg-1")!.killed).toBe(1);
  });

  it("never throws even when the microVM no longer responds", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs({
      ...runner,
      stop: async () => {
        throw new Error("sandbox is gone");
      },
    });
    await jobs.handle({ action: "start", command: "npm run dev" });
    await expect(jobs.stopAll()).resolves.toBe(1);
  });

  it("reports a launch failure as a tool error", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs({
      ...runner,
      start: async () => {
        throw new Error("path escapes the repository");
      },
    });
    const out = await jobs.handle({
      action: "start",
      command: "npm run dev",
      workdir: "../..",
    });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(
      /escapes the repository/,
    );
    // The reserved slot is returned: failure does not consume a job.
    expect(jobs.liveCount()).toBe(0);
  });
});
