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
import { FORBIDDEN_COMMAND_REASON } from "./command-guard";
import { layoutForRoot } from "./harness-layout";
import { startBackground, type RepoHost } from "./repo-host";

/**
 * Background jobs (MIN-114). What is tested here is the POLICY: the git
 * guardrail (otherwise `run_background` would be a backdoor to `git push` *), the ceiling of
 * jobs, the output INCREMENT (a chatty watcher should not resaturate the context
 * on each probe) and the message of a job that no longer exists. Hands in the
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
    invocation: { executable: string; args: string[]; env: Record<string, string> };
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
      const chunk = increment > 0 ? proc.log.slice(Math.max(offset, proc.log.length - maxBytes)) : "";
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
    // stdin closed: a job waiting for an entry would die instead of holding the
    // microVM; stdout/stderr in the log, otherwise the launcher would wait for its end.
    expect(script).toMatch(/> '\/vercel\/sandbox\/tool-output\/bg-1\.log' 2>&1 < \/dev\/null &/);
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

  it("sonde à partir de l'offset, borne l'incrément par la queue", () => {
    const script = backgroundProbeScript(paths, 4242, 100, 32_000);
    expect(script).toContain("tail -c +101");
    expect(script).toContain("head -c $((size - 100))");
    expect(script).toContain("tail -c 32000");
    expect(script).toContain(`echo "${BACKGROUND_PROBE_HEADER} $size $running $code"`);
  });

  it("juge la vie du job sur son ÉTAT, pas sur `kill -0` (les zombies de la microVM)", () => {
    // Le PID 1 de la microVM ne moissonne pas : un job mort y reste ZOMBIE, et
    // `kill -0` succeeds for it—a crashed server would be reported as “running”.
    for (const script of [backgroundProbeScript(paths, 4242, 0, 100), backgroundStopScript(4242)]) {
      expect(script).toContain("ps -o stat= -p 4242");
      expect(script).toContain(`""|Z*) return 1`);
      expect(script).not.toContain("kill -0");
    }
  });

  it("arrête le GROUPE quand le PID en est le chef, jamais le nôtre sinon", () => {
    const script = backgroundStopScript(4242);
    expect(script).toContain("ps -o pgid= -p 4242");
    expect(script).toContain(`if [ "$pgid" = "4242" ]; then target="-4242"; else target="4242"; fi`);
    expect(script).toContain("kill -TERM $target");
    expect(script).toContain("kill -KILL $target");
    // A process that is already dead is not a tool error.
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });
});

describe("lecture de la sonde", () => {
  it("sépare l'en-tête du log, même si le log contient l'en-tête", () => {
    const stdout = `${BACKGROUND_PROBE_HEADER} 120 1 -\nready\n${BACKGROUND_PROBE_HEADER} fake\n`;
    const read = parseBackgroundProbe(stdout, { offset: 100, maxBytes: 32_000 });
    expect(read.chunk).toBe(`ready\n${BACKGROUND_PROBE_HEADER} fake\n`);
    expect(read.nextOffset).toBe(120);
    expect(read.running).toBe(true);
    expect(read.exitCode).toBeNull();
    expect(read.skippedBytes).toBe(0);
  });

  it("rend le code de sortie d'un job terminé, et compte ce qui a été sauté", () => {
    const read = parseBackgroundProbe(`${BACKGROUND_PROBE_HEADER} 90000 0 1\nboom\n`, {
      offset: 0,
      maxBytes: 32_000,
    });
    expect(read.running).toBe(false);
    expect(read.exitCode).toBe(1);
    expect(read.skippedBytes).toBe(58_000);
  });

  it("ne prête pas de code de sortie à un job vivant", () => {
    const read = parseBackgroundProbe(`${BACKGROUND_PROBE_HEADER} 10 1 0\nhi\n`, {
      offset: 0,
      maxBytes: 32_000,
    });
    expect(read.exitCode).toBeNull();
  });

  it("lève si la sonde n'a pas répondu (microVM partie)", () => {
    expect(() => parseBackgroundProbe("sh: 1: kill: not found\n", { offset: 0, maxBytes: 10 })).toThrow();
  });
});

describe("run_background — static command boundary", () => {
  it("refuse une commande git interdite, avec le même `reason` que run_command", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "start", command: "git push origin HEAD" });
    expect(out.success).toBe(false);
    expect(out.reason).toBe(FORBIDDEN_COMMAND_REASON);
    expect(String(asRecord(out.result).error)).toMatch(/harness owns the remote/i);
    // Nothing has been launched in the microVM: the refusal happens BEFORE.
    expect(starts).toHaveLength(0);
  });

  it("rejects a forbidden command hidden in shell composition", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({
      action: "start",
      command: "npm run dev & git reset --hard",
    });
    expect(out.success).toBe(false);
    expect(starts).toHaveLength(0);
  });

  it("passes a safe development server as structured argv", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "start", command: "npm run dev", workdir: "apps/web" });
    expect(out.success).toBe(true);
    expect(starts).toEqual([
      {
        jobId: "bg-1",
        invocation: { executable: "npm", args: ["run", "dev"], env: {} },
        workdir: "apps/web",
      },
    ]);
    expect(asRecord(out.result).job_id).toBe("bg-1");
    expect(String(asRecord(out.result).log_path)).toContain("bg-1.log");
  });

  it("rejects evaluators, expansion, substitutions, and shell scripts", async () => {
    const commands = [
      "eval 'git push origin HEAD'",
      'tool=git; "$tool" push origin HEAD',
      'echo "$(git push origin HEAD)"',
      "echo `git reset --hard`",
      "source ./agent-command.sh",
      ". ./agent-command.sh",
      "bash ./agent-command.sh",
      "sh -c 'git push origin HEAD'",
      "./agent-command.sh",
      "PATH=. git push origin HEAD",
      "NODE_OPTIONS=--require=./agent-command.js npm run dev",
    ];
    for (const command of commands) {
      const { runner, starts } = fakeRunner();
      const out = await new BackgroundJobs(runner).handle({ action: "start", command });
      expect(out.success, command).toBe(false);
      expect(out.reason, command).toBe(FORBIDDEN_COMMAND_REASON);
      expect(starts, command).toHaveLength(0);
    }
  });

  it("accepts literal quoting and a narrow set of startup environment flags", async () => {
    const verdict = parseBackgroundCommand(`CI=1 PORT='3000' npm run dev -- --hostname "127.0.0.1"`);
    expect(verdict).toEqual({
      allowed: true,
      invocation: {
        executable: "npm",
        args: ["run", "dev", "--", "--hostname", "127.0.0.1"],
        env: { CI: "1", PORT: "3000" },
      },
    });
  });

  it("rechecks forged structured input at the execution boundary", () => {
    expect(
      checkBackgroundInvocation({ executable: "sh", args: ["-c", "git push"], env: {} }).allowed,
    ).toBe(false);
    expect(
      checkBackgroundInvocation({ executable: "git", args: ["push", "origin", "HEAD"], env: {} })
        .allowed,
    ).toBe(false);
    expect(
      checkBackgroundInvocation({ executable: "npm", args: ["run", "dev"], env: {} }).allowed,
    ).toBe(true);
  });

  it("rejects forged structured input before the host executes", async () => {
    let executions = 0;
    const host: RepoHost = {
      layout: layoutForRoot("/run/background-boundary", "/opt/opencode"),
      exec: async () => {
        executions++;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      readFile: async () => null,
      writeFile: async () => {},
      mkdir: async () => {},
    };
    await expect(
      startBackground(host, {
        jobId: "bg-forged",
        invocation: { executable: "sh", args: ["-c", "git push origin HEAD"], env: {} },
      }),
    ).rejects.toThrow(/only literal, non-shell programs/i);
    expect(executions).toBe(0);
  });
});

describe("run_background — plafond de jobs", () => {
  it(`refuse au-delà de ${MAX_BACKGROUND_JOBS} jobs vivants, en nommant ceux qui tournent`, async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (let i = 0; i < MAX_BACKGROUND_JOBS; i++) {
      expect((await jobs.handle({ action: "start", command: `sleep ${i}` })).success).toBe(true);
    }
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(/Too many background jobs/);
    expect(String(asRecord(out.result).error)).toContain("bg-1");
  });

  it("libère la place dès qu'un job est arrêté", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (let i = 0; i < MAX_BACKGROUND_JOBS; i++) {
      await jobs.handle({ action: "start", command: `sleep ${i}` });
    }
    expect((await jobs.handle({ action: "stop", job_id: "bg-1" })).success).toBe(true);
    expect(jobs.liveCount()).toBe(MAX_BACKGROUND_JOBS - 1);
    expect((await jobs.handle({ action: "start", command: "npm run dev" })).success).toBe(true);
  });

  it("compte les slots AVANT de lancer : deux starts simultanés ne passent pas en double", async () => {
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

describe("run_background — `check` renvoie l'incrément, pas tout depuis le début", () => {
  it("ne rend que ce qui a été écrit depuis la sonde précédente", async () => {
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

  it("borne un watcher bavard et renvoie vers le log complet", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run watch" });
    procs.get("bg-1")!.log = "x".repeat(500_000);

    const out = await jobs.handle({ action: "check", job_id: "bg-1" });
    const result = asRecord(out.result);
    expect(String(result.output).length).toBeLessThanOrEqual(BACKGROUND_OUTPUT_CAP);
    expect(String(result.note)).toContain("bg-1.log");
    expect(String(result.note)).toMatch(/bytes were skipped/);
    // The offset has progressed well to the end: the next probe does not replay everything.
    const next = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(String(asRecord(next.result).output)).toMatch(/nothing new/i);
  });

  it("dit qu'un job est mort, avec son code de sortie (échec = `success` faux)", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    await jobs.handle({ action: "start", command: "npm run dev" });
    Object.assign(procs.get("bg-1")!, { running: false, exitCode: 1, log: "EADDRINUSE\n" });

    const out = await jobs.handle({ action: "check", job_id: "bg-1" });
    expect(asRecord(out.result).running).toBe(false);
    expect(asRecord(out.result).exit_code).toBe(1);
    expect(asRecord(out.result).output).toContain("EADDRINUSE");
    expect(out.success).toBe(false);
    // Un job mort ne tient plus de place.
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
describe("run_background — où lire le log complet, selon le moteur", () => {
  it("envoie la boucle maison sur `read_file` / `grep`", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(String(asRecord(out.result).note)).toContain("readable with read_file and grep");
  });

  it("envoie opencode sur son SHELL, jamais sur `read`", async () => {
    const { runner, procs } = fakeRunner();
    const jobs = new BackgroundJobs(runner, 0, OPENCODE_BACKGROUND_LOG_NOTES);
    const started = await jobs.handle({ action: "start", command: "npm run dev" });
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

describe("run_background — jobs d'un autre tour", () => {
  it("explique qu'un job_id inconnu ne survit pas au tour", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    for (const action of ["check", "stop"] as const) {
      const out = await jobs.handle({ action, job_id: "bg-7" });
      expect(out.success).toBe(false);
      expect(String(asRecord(out.result).error)).toMatch(/do not survive a turn/i);
    }
  });

  it("numérote les jobs par tranche de continuation (pas de log écrasé)", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner, 2000);
    const out = await jobs.handle({ action: "start", command: "npm run dev" });
    expect(asRecord(out.result).job_id).toBe("bg-2001");
  });

  it("refuse une action inconnue", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "write_stdin", job_id: "bg-1" });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(/"start", "check" or "stop"/);
  });
});

describe("run_background — fin de tour", () => {
  it("tue tous les jobs vivants, une seule fois chacun", async () => {
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

  it("ne lève jamais, même si la microVM ne répond plus", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs(
      { ...runner, stop: async () => { throw new Error("sandbox is gone"); } },
    );
    await jobs.handle({ action: "start", command: "npm run dev" });
    await expect(jobs.stopAll()).resolves.toBe(1);
  });

  it("remonte une erreur de lancement comme une erreur de tool", async () => {
    const { runner } = fakeRunner();
    const jobs = new BackgroundJobs({
      ...runner,
      start: async () => {
        throw new Error("path escapes the repository");
      },
    });
    const out = await jobs.handle({ action: "start", command: "npm run dev", workdir: "../.." });
    expect(out.success).toBe(false);
    expect(String(asRecord(out.result).error)).toMatch(/escapes the repository/);
    // The reserved slot is returned: failure does not consume a job.
    expect(jobs.liveCount()).toBe(0);
  });
});
