import { describe, expect, it } from "vitest";
import {
  BackgroundJobs,
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  parseBackgroundProbe,
  BACKGROUND_OUTPUT_CAP,
  BACKGROUND_PROBE_HEADER,
  MAX_BACKGROUND_JOBS,
  OPENCODE_BACKGROUND_LOG_NOTES,
  type BackgroundChunk,
  type BackgroundJobRunner,
} from "./background";
import { FORBIDDEN_COMMAND_REASON } from "./command-guard";

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
  const starts: Array<{ jobId: string; command: string; workdir?: string }> = [];
  let nextPid = 100;
  const byPid = new Map<number, string>();

  const runner: BackgroundJobRunner = {
    async start({ jobId, command, workdir }) {
      starts.push({ jobId, command, workdir });
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

describe("le shell d'un job", () => {
  it("détache le job, redirige ses flux et fait écrire le PID par le job", () => {
    const script = backgroundStartScript(paths, "npm run dev", "/vercel/sandbox/tool-output");
    expect(script).toContain("setsid sh -c");
    // stdin closed: a job waiting for an entry would die instead of holding the
    // microVM; stdout/stderr in the log, otherwise the launcher would wait for its end.
    expect(script).toMatch(/> '\/vercel\/sandbox\/tool-output\/bg-1\.log' 2>&1 < \/dev\/null &/);
    expect(script).toContain("echo $$ >");
    expect(script).toContain("echo $? >");
    expect(script).not.toContain("$!");
  });

  it("passe une commande à guillemets sans la casser", () => {
    const script = backgroundStartScript(paths, `sh -c 'echo it'\\''s alive'`, "/tmp");
    // A single quoted string for the entire body of the job: nothing escapes.
    expect(script).toContain(`echo it'`);
    expect(script.match(/setsid sh -c '/g)).toHaveLength(1);
  });

  it("met la commande dans un sous-shell pour ne pas perdre son code de sortie", () => {
    // Measured on a real microVM: without the parentheses, `echo boom; exit 3`
    // exited the job shell BEFORE the line that writes the exit code.
    const script = backgroundStartScript(paths, "echo boom; exit 3", "/tmp");
    expect(script).toContain("( echo boom; exit 3\n)");
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

describe("run_background — garde-fou git (MIN-108 vaut ici aussi)", () => {
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

  it("attrape la commande interdite cachée dans une chaîne", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({
      action: "start",
      command: "npm run dev & git reset --hard",
    });
    expect(out.success).toBe(false);
    expect(starts).toHaveLength(0);
  });

  it("laisse passer un serveur de dev", async () => {
    const { runner, starts } = fakeRunner();
    const jobs = new BackgroundJobs(runner);
    const out = await jobs.handle({ action: "start", command: "npm run dev", workdir: "apps/web" });
    expect(out.success).toBe(true);
    expect(starts).toEqual([{ jobId: "bg-1", command: "npm run dev", workdir: "apps/web" }]);
    expect(asRecord(out.result).job_id).toBe("bg-1");
    expect(String(asRecord(out.result).log_path)).toContain("bg-1.log");
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
