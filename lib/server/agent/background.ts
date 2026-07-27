import { checkCommand, FORBIDDEN_COMMAND_REASON } from "./command-guard";
import { headTail } from "./prune";

/**
 * Jobs de FOND de l'agent (MIN-114). `run_command` est BLOQUANT : il attend la fin
 * de la commande, puis la tue. L'agent ne pouvait donc pas lancer un serveur de
 * dev — donc jamais vérifier qu'une page rend ou qu'une route répond. Il vérifiait
 * ce qui tient dans un `exit 0`, ou rien.
 *
 * On prend les 20 % qui portent la capacité — **démarrer, sonder, arrêter** — et
 * pas le shell à sessions PTY de Codex : une session interactive ne survivrait ni
 * au suspend/resume ni à l'arrêt de la microVM par le reaper, et l'interactivité
 * ne sert qu'un humain devant un terminal.
 *
 * Ce module est PUR (comme `command-guard` / `command-output`) : la POLITIQUE —
 * plafond de jobs, garde-fou git, offsets, mise en forme — est ici, testable sans
 * microVM ; les mains dans la sandbox sont derrière `BackgroundJobRunner`, câblé
 * dans `execute.ts`. Le registre vit le temps d'UN chunk : un job ne survit pas à
 * un suspend, et la fin de tour les tue tous (`stopAll`).
 */

/** Jobs VIVANTS simultanés. Au-delà, `start` refuse — un agent qui empile les
 *  serveurs a perdu le fil, et la microVM est petite. */
export const MAX_BACKGROUND_JOBS = 3;

/** Octets tirés de la microVM à chaque `check` (la QUEUE de l'incrément). Au-delà,
 *  le milieu manquant reste lisible dans le log, sur disque. */
export const BACKGROUND_FETCH_BYTES = 32_000;

/** Caractères de sortie renvoyés au modèle par `check` (tête + queue). */
export const BACKGROUND_OUTPUT_CAP = 3000;

/** Ce que la sandbox renvoie au démarrage d'un job. */
export interface BackgroundStarted {
  pid: number;
  logPath: string;
}

/** Ce que la sandbox renvoie à chaque sonde. */
export interface BackgroundChunk {
  /** Octets écrits depuis `offset` (au plus `BACKGROUND_FETCH_BYTES`, pris à la fin). */
  chunk: string;
  /** Nouvel offset = taille du log (on saute ce qu'on n'a pas tiré). */
  nextOffset: number;
  running: boolean;
  /** Code de sortie si le processus est terminé, sinon null. */
  exitCode: number | null;
  /** Octets de l'incrément non tirés (trop gros) — ils restent dans le log. */
  skippedBytes: number;
}

// ── Le shell d'un job (PUR : c'est la partie risquée, elle doit être lisible) ──

/** Les trois fichiers d'un job dans la microVM (chemins calculés par `sandbox.ts`). */
export interface BackgroundPaths {
  /** stdout + stderr du job. */
  log: string;
  /** PID, écrit par le job lui-même. */
  pid: string;
  /** Code de sortie, écrit quand la commande rend la main. */
  exit: string;
}

/** En-tête de la sonde : première ligne de sa sortie, le reste est le log. */
export const BACKGROUND_PROBE_HEADER = "__MDY_BG__";

/** Quote sûre pour insérer une valeur dans une commande `sh -c` (jumelle de
 *  celle de `sandbox.ts` — ce module reste pur, il n'importe rien du serveur). */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Test de vie d'un job, par l'ÉTAT du processus et non par `kill -0` : le PID 1 de
 * la microVM ne moissonne pas ses orphelins, donc un job mort y reste ZOMBIE — et
 * `kill -0` réussit sur un zombie. Mesuré : sans ça, un serveur qui vient de
 * planter était rapporté « still running » pour toujours, c'est-à-dire l'exact
 * contraire du signal utile.
 */
function aliveFn(pid: number): string {
  return `bg_alive() { s=$(ps -o stat= -p ${pid} 2>/dev/null | tr -d ' '); case "$s" in ""|Z*) return 1;; *) return 0;; esac; }`;
}

/**
 * Script de LANCEMENT. Trois précautions font tenir l'ensemble :
 *  - `setsid` : le job devient chef de sa propre SESSION, donc son PID est aussi
 *    son PGID. Il survit au shell qui l'a lancé, et l'arrêt peut viser le GROUPE
 *    (un `npm run dev` lance un enfant ; tuer le père seul laisserait le port pris).
 *  - redirections : stdout/stderr vont dans le log, stdin vient de /dev/null —
 *    sinon le job garderait les tuyaux du lanceur ouverts et l'appel attendrait sa
 *    fin, c'est-à-dire exactement ce qu'on essaie d'éviter.
 *  - le PID est écrit PAR le job (`echo $$`), pas lu depuis `$!` : selon que
 *    `setsid` fork ou non, `$!` désigne l'un ou l'autre processus.
 */
export function backgroundStartScript(p: BackgroundPaths, command: string, dir: string): string {
  // Le corps du job : son PID, la commande, puis son code de sortie. Pas d'`exec` :
  // le shell reste père de la commande — c'est lui que la sonde suit, et c'est lui
  // qui écrit le code de sortie. La commande tourne dans un SOUS-SHELL : sans les
  // parenthèses, un `exit 3` (ou un `set -e` qui claque) quitterait le shell du job
  // avant la ligne du code de sortie, qu'on ne verrait alors jamais.
  const inner = [`echo $$ > ${sq(p.pid)}`, `( ${command}\n)`, `echo $? > ${sq(p.exit)}`].join("\n");
  return [
    `mkdir -p ${sq(dir)}`,
    `rm -f ${sq(p.pid)} ${sq(p.exit)}`,
    `: > ${sq(p.log)}`,
    `if command -v setsid >/dev/null 2>&1; then`,
    `  setsid sh -c ${sq(inner)} > ${sq(p.log)} 2>&1 < /dev/null &`,
    `else`,
    `  sh -c ${sq(inner)} > ${sq(p.log)} 2>&1 < /dev/null &`,
    `fi`,
    // Le job écrit son PID à sa première ligne : quelques dixièmes suffisent.
    `i=0`,
    `while [ "$i" -lt 50 ] && [ ! -s ${sq(p.pid)} ]; do sleep 0.1; i=$((i+1)); done`,
    `cat ${sq(p.pid)} 2>/dev/null`,
  ].join("\n");
}

/**
 * Script de SONDE : un en-tête (taille du log, vivant ?, code de sortie) puis les
 * octets écrits depuis `offset`, bornés à `maxBytes` pris à la FIN — un watcher
 * bavard ne doit pas ramener 40 Mo par sonde. `wc -c` fixe la taille AVANT la
 * lecture pour que l'offset renvoyé corresponde exactement à ce qui a été coupé.
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
 * Script d'ARRÊT : SIGTERM, délai de grâce, puis SIGKILL. Vise le GROUPE de
 * processus quand le PID en est bien le chef (cas normal, cf. `setsid`) — sinon un
 * `npm run dev` laisserait son enfant, et son port, derrière lui. Sort toujours 0 :
 * un processus déjà mort n'est pas une erreur.
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
 * Lit la sortie de la sonde. La première ligne est l'en-tête, tout le reste est le
 * log — un log qui contiendrait lui-même l'en-tête ne trompe donc personne.
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
    // Un job vivant n'a pas de code ; un job tué au SIGKILL n'en a pas non plus.
    exitCode: running || !Number.isInteger(exitCode) ? null : exitCode,
    skippedBytes: Math.max(0, nextOffset - opts.offset - opts.maxBytes),
  };
}

/** Les mains dans la microVM (implémentées par `sandbox.ts`, câblées par `execute.ts`). */
export interface BackgroundJobRunner {
  start(opts: { jobId: string; command: string; workdir?: string }): Promise<BackgroundStarted>;
  read(opts: { jobId: string; pid: number; offset: number }): Promise<BackgroundChunk>;
  stop(opts: { jobId: string; pid: number }): Promise<void>;
}

interface Job {
  jobId: string;
  command: string;
  pid: number;
  logPath: string;
  /** Octets déjà renvoyés au modèle (ou sautés) : `check` renvoie l'INCRÉMENT. */
  offset: number;
  /** Le processus est-il terminé (constaté par une sonde) ? */
  exited: boolean;
  exitCode: number | null;
}

/** Forme d'un résultat de tool (identique au contrat de `ExecuteAgentTool`). */
interface ToolOutcome {
  result: unknown;
  success: boolean;
  reason?: string;
}

function fail(error: string, reason?: string): ToolOutcome {
  return { result: { error }, success: false, ...(reason ? { reason } : {}) };
}

/** Le job est-il encore susceptible de consommer la microVM ? */
function isLive(job: Job): boolean {
  return !job.exited;
}

export class BackgroundJobs {
  private readonly jobs = new Map<string, Job>();
  private seq = 0;

  /**
   * @param runner  les mains dans la microVM
   * @param seqBase base des numéros de job, tranchée par continuation (comme les
   *                autres compteurs de run) : deux chunks ne réutilisent pas le
   *                même nom de fichier de log.
   */
  constructor(
    private readonly runner: BackgroundJobRunner,
    private readonly seqBase = 0,
  ) {}

  /** Exécute un appel `run_background`. Ne lève jamais : tout revient au modèle
   *  comme un résultat de tool, réussi ou en erreur. */
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
        return fail(`Unknown action ${JSON.stringify(action)} — use "start", "check" or "stop".`);
    }
  }

  /** Tue tous les jobs vivants. Best-effort, ne lève jamais. Appelé avant chaque
   *  push (un watcher qui écrit pendant le `git add -A` commiterait n'importe quoi)
   *  et en fin de chunk. Renvoie le nombre de jobs tués. */
  async stopAll(): Promise<number> {
    const live = [...this.jobs.values()].filter(isLive);
    await Promise.all(
      live.map(async (job) => {
        await this.runner.stop({ jobId: job.jobId, pid: job.pid }).catch(() => {});
        job.exited = true;
      }),
    );
    return live.length;
  }

  /** Jobs encore vivants (diagnostic / fin de tour). */
  liveCount(): number {
    return [...this.jobs.values()].filter(isLive).length;
  }

  private async start(args: Record<string, unknown>): Promise<ToolOutcome> {
    const command = String(args.command ?? "").trim();
    if (!command) return fail("command is required to start a background job.");

    // Le garde-fou git de MIN-108 vaut ICI AUSSI : sans lui, `run_background`
    // serait une porte dérobée sur `git push` & consorts.
    const verdict = checkCommand(command);
    if (!verdict.allowed) return fail(verdict.reason, FORBIDDEN_COMMAND_REASON);

    const live = [...this.jobs.values()].filter(isLive);
    if (live.length >= MAX_BACKGROUND_JOBS) {
      return fail(
        `Too many background jobs (${live.length}/${MAX_BACKGROUND_JOBS}). Stop one first: ` +
          live.map((j) => `${j.jobId} (${j.command})`).join(", "),
      );
    }

    const jobId = `bg-${this.seqBase + ++this.seq}`;
    // Réservation AVANT l'await : les tool-calls d'un round partent en parallèle,
    // deux `start` simultanés passeraient sinon tous les deux sous le plafond.
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
        command,
        workdir: args.workdir != null && String(args.workdir).trim() !== "" ? String(args.workdir) : undefined,
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
          `written since the previous one. The complete log is at ${job.logPath} (readable with ` +
          `read_file and grep). Stop it with {action:"stop"} as soon as you are done; every ` +
          `background job is killed at the end of this turn anyway.`,
      },
      success: true,
    };
  }

  private async check(args: Record<string, unknown>): Promise<ToolOutcome> {
    const job = this.jobs.get(String(args.job_id ?? "").trim());
    if (!job) return fail(this.unknownJob(String(args.job_id ?? "")));

    // On sonde même un job déjà constaté mort : sa dernière sortie (le stack trace
    // qui l'a tué) n'a pas forcément été lue.
    let read: BackgroundChunk;
    try {
      read = await this.runner.read({ jobId: job.jobId, pid: job.pid, offset: job.offset });
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
                (read.skippedBytes > 0 ? ` (${read.skippedBytes} bytes were skipped)` : "") +
                `. The complete log is at ${job.logPath} — grep it or read_file it with ` +
                `offset/limit instead of polling again.`,
            }
          : {}),
      },
      // Même règle que `run_command` : un job mort d'un code non nul est un échec.
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

  /** Message d'un `job_id` inconnu : la cause la plus fréquente est un tour
   *  précédent — les jobs ne survivent pas à un tour, et le modèle doit le lire. */
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
