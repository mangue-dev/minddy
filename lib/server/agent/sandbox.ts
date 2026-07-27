import "server-only";

import { Sandbox } from "@vercel/sandbox";

import {
  backgroundProbeScript,
  backgroundStartScript,
  backgroundStopScript,
  parseBackgroundProbe,
  type BackgroundChunk,
  type BackgroundPaths,
} from "./background";
import { grepPathspecs, globPathspec } from "./git-pathspec";
import { isInvalidRegexError } from "./grep-pattern";
import { resolveWithin, resolveReadable, assertNotGit } from "./repo-path";

/**
 * Couche Vercel Sandbox de l'agent de code (MIN-46) — les « mains » de l'agent.
 * Une microVM isolée (node24) où l'on clone le dépôt lié, édite, lance
 * install/build/tests, commit et push. Le reste de l'agent (boucle LLM, tools,
 * orchestration) est bâti au-dessus dans lib/server/agent/*.
 *
 * IDENTITÉ & REPRISE : un Sandbox est identifié par un `name` DÉTERMINISTE
 * (`agent-<run.id>`, persisté dans agent_runs.sandbox_id). `getOrCreateAgentSandbox`
 * est idempotent : si la microVM (ou son SNAPSHOT persistant) existe encore, elle
 * est RÉVEILLÉE avec son filesystem restauré (reprise rapide, pas de re-clone) ;
 * sinon `onCreate` clone la branche de travail sur une VM neuve. On active donc
 * `persistent: true` (restauration automatique du FS entre sessions via snapshots)
 * + `snapshotExpiration`. Le git (branche WIP poussée à chaque pause) reste le
 * filet durable au-delà de l'expiration du snapshot. AUTH : réutilise
 * VERCEL_TOKEN/TEAM_ID/PROJECT_ID (comme les domaines custom, MIN-36) ; sur Vercel
 * l'OIDC suffit.
 */

/** Runtime de la microVM. */
const SANDBOX_RUNTIME = "node24";
/** Durée de vie max d'une session de la microVM (survit au gap entre deux chunks).
 *  Backstop : l'inactivité réelle est gérée par le reaper (coupe après ~5 min). */
const SANDBOX_TIMEOUT_MS = 45 * 60_000;
/** Rétention des snapshots persistants (reprise rapide). Au-delà, on retombe sur
 *  le re-clone de la branche git (durable pour toujours). */
const SANDBOX_SNAPSHOT_EXPIRATION_MS = 7 * 24 * 60 * 60_000;
/** Où le dépôt est cloné dans la microVM. */
export const REPO_DIR = "/vercel/sandbox/repo";
/** Home par défaut du Sandbox (parent de REPO_DIR). */
const SANDBOX_HOME = "/vercel/sandbox";
/**
 * Où le harness dépose les sorties de tools trop longues pour le modèle (MIN-107).
 * DÉLIBÉRÉMENT hors de REPO_DIR : le `git add -A` de fin de tour ne le voit pas,
 * donc rien de tout ça n'atterrit jamais dans un commit ou une PR. Le nettoyage
 * est celui de la microVM (snapshot expiré) — rien à gérer.
 */
export const TOOL_OUTPUT_DIR = "/vercel/sandbox/tool-output";
/** Dossiers LISIBLES hors dépôt (read_file / grep / list_dir). Jamais writables. */
const READABLE_DIRS = [TOOL_OUTPUT_DIR];

export type { Sandbox };

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Quote sûre pour insérer une valeur dans une commande `sh -c`. */
function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Credentials Sandbox explicites (dev / hors-Vercel). Vides sur Vercel → l'OIDC
 * prend le relais automatiquement.
 */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/**
 * Récupère la microVM nommée `name` en RÉVEILLANT sa session (filesystem restauré
 * depuis le snapshot persistant → reprise rapide, `onCreate` NON appelé), sinon en
 * crée une neuve et appelle `onCreate` (qui clone la branche de travail). Un snapshot
 * expiré est traité comme « introuvable » → recrée + `onCreate`. Boot optionnel
 * depuis AGENT_SANDBOX_SNAPSHOT_ID (image pré-chauffée) pour la création fraîche.
 */
export async function getOrCreateAgentSandbox(opts: {
  name: string;
  onCreate: (sandbox: Sandbox) => Promise<void>;
}): Promise<{ sandbox: Sandbox }> {
  const creds = sandboxCredentials();
  const snapshotId = process.env.AGENT_SANDBOX_SNAPSHOT_ID?.trim();
  const base = {
    ...creds,
    name: opts.name,
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: SANDBOX_SNAPSHOT_EXPIRATION_MS,
    resume: true,
    onCreate: opts.onCreate,
  };
  const sandbox = snapshotId
    ? await Sandbox.getOrCreate({ ...base, source: { type: "snapshot", snapshotId } })
    : await Sandbox.getOrCreate({ ...base, runtime: SANDBOX_RUNTIME });
  return { sandbox };
}

/** Nom stable de la microVM à persister dans agent_runs.sandbox_id. */
export function sandboxName(sandbox: Sandbox): string {
  return sandbox.name;
}

/**
 * Arrête une microVM par son NOM sans la réveiller (`resume: false`), pour le reaper
 * d'inactivité : on coupe la VM au repos tout en gardant son snapshot persistant, de
 * sorte que la session reste reprennable (réveil rapide au prochain message).
 * Best-effort — ne lève jamais (déjà arrêtée / expirée / introuvable).
 */
export async function stopSandboxByName(name: string): Promise<void> {
  try {
    const creds = sandboxCredentials();
    const sandbox = await Sandbox.get({ ...creds, name, resume: false });
    await sandbox.stop();
  } catch {
    // best-effort.
  }
}

/**
 * Exécute une commande shell dans la microVM. cwd = REPO_DIR par défaut (les
 * tools de l'agent opèrent dans le dépôt). Renvoie exitCode + stdout + stderr.
 */
export async function runShell(
  sandbox: Sandbox,
  command: string,
  opts?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string> },
): Promise<ShellResult> {
  const res = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", command],
    cwd: opts?.cwd ?? REPO_DIR,
    timeoutMs: opts?.timeoutMs,
    signal: opts?.signal,
    env: opts?.env,
  });
  const [stdout, stderr] = await Promise.all([res.stdout(), res.stderr()]);
  return { exitCode: res.exitCode, stdout, stderr };
}

/**
 * Clone le dépôt (shallow) sur `baseBranch` dans REPO_DIR puis se place sur
 * `workBranch` : reprise de la branche distante si elle existe déjà (le run a
 * poussé du WIP à un chunk précédent), sinon création depuis la base. `authUrl`
 * porte un token d'installation éphémère — jamais persisté hors de la microVM.
 */
export async function cloneRepo(
  sandbox: Sandbox,
  opts: {
    authUrl: string;
    baseBranch: string;
    workBranch: string;
    // Identité git des commits de l'agent. Doit être rattachable à un vrai compte
    // du forge (bot de l'App côté GitHub) : sinon Vercel bloque le déploiement.
    committer: { name: string; email: string };
  },
): Promise<void> {
  const wipe = await runShell(sandbox, `rm -rf ${sq(REPO_DIR)}`, { cwd: SANDBOX_HOME });
  if (wipe.exitCode !== 0) throw new Error(`cleanup failed: ${wipe.stderr || wipe.stdout}`);

  const clone = await runShell(
    sandbox,
    `git clone --depth 1 --branch ${sq(opts.baseBranch)} ${sq(opts.authUrl)} ${sq(REPO_DIR)}`,
    { cwd: SANDBOX_HOME, timeoutMs: 180_000 },
  );
  if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);

  const setup = [
    `set -e`,
    `git config user.email ${sq(opts.committer.email)}`,
    `git config user.name ${sq(opts.committer.name)}`,
    `if git ls-remote --exit-code --heads ${sq(opts.authUrl)} ${sq(opts.workBranch)} >/dev/null 2>&1; then`,
    `  git fetch --depth 1 ${sq(opts.authUrl)} ${sq(opts.workBranch)}:${sq(opts.workBranch)}`,
    `  git checkout ${sq(opts.workBranch)}`,
    `else`,
    `  git checkout -b ${sq(opts.workBranch)}`,
    `fi`,
  ].join("\n");
  const branch = await runShell(sandbox, setup, { timeoutMs: 120_000 });
  if (branch.exitCode !== 0) throw new Error(`branch setup failed: ${branch.stderr || branch.stdout}`);
}

/**
 * Stage tout, commit s'il y a des changements, puis push HEAD → workBranch. À
 * appeler à chaque suspend et à la fin (l'état du repo devient durable dans git).
 * `authUrl` doit porter un token FRAIS (l'appelant le re-résout avant l'appel).
 *
 * Renvoie le sha de HEAD, si un commit a été créé, et surtout `remoteUpdated` : le
 * push a-t-il fait AVANCER la branche distante ? C'est LE signal « du vrai travail
 * vient d'arriver sur le remote » — plus fiable que `committed`, qui ne voit que
 * l'appel courant : un commit posé par un appel précédent dont le push avait
 * échoué (5xx transitoire) part avec un arbre PROPRE au push suivant
 * (committed=false), et inversement un tour purement conversationnel pousse un
 * no-op (remote déjà à jour). Les décisions du type « rouvrir la PR refusée »
 * doivent se prendre sur `remoteUpdated`.
 */
export async function commitAndPush(
  sandbox: Sandbox,
  opts: { authUrl: string; workBranch: string; message: string },
): Promise<{ committed: boolean; remoteUpdated: boolean; headSha: string }> {
  const status = await runShell(sandbox, `git status --porcelain`);
  const dirty = status.stdout.trim().length > 0;

  if (dirty) {
    const staged = await runShell(sandbox, `git add -A`);
    if (staged.exitCode !== 0) throw new Error(`git add failed: ${staged.stderr || staged.stdout}`);
    const commit = await runShell(sandbox, `git commit -m ${sq(opts.message)}`);
    if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const head = await runShell(sandbox, `git rev-parse HEAD`);
  const headSha = head.stdout.trim();

  // Sha actuel de la branche distante (vide si elle n'existe pas encore). Best-
  // effort : si ls-remote échoue, on suppose le remote en retard (remoteUpdated
  // sera true si le push passe) — mieux vaut un reopen de trop qu'un travail
  // poussé sans réouverture de sa PR refusée.
  const remote = await runShell(
    sandbox,
    `git ls-remote ${sq(opts.authUrl)} ${sq(`refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 60_000 },
  );
  const remoteSha = remote.exitCode === 0 ? remote.stdout.trim().split(/\s/)[0] ?? "" : "";

  const push = await runShell(
    sandbox,
    `git push ${sq(opts.authUrl)} ${sq(`HEAD:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  return { committed: dirty, remoteUpdated: remoteSha !== headSha, headSha };
}

// ── Diff par tour (event `files_changed`, MIN-46) ────────────────────────────

/** Nombre max de fichiers listés dans un event `files_changed` (gros tour borné). */
export const CHANGED_FILES_CAP = 100;

/** Un fichier changé sur un intervalle git. Défini ICI : sandbox.ts (serveur) ne
    dépend pas de la couche client `lib/agent-api.ts` (« use client »). Même forme. */
interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  previousPath?: string;
}

/** HEAD courant du dépôt (sha), ou "" si indéterminable. Best-effort — ne lève pas. */
export async function revParseHead(sandbox: Sandbox): Promise<string> {
  try {
    const res = await runShell(sandbox, `git rev-parse HEAD`);
    return res.exitCode === 0 ? res.stdout.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Résout le chemin APRÈS d'un champ path de `git diff --numstat`, qui compacte les
 * renommages (`a => b`, `{a => b}`, `pre/{a => b}/post`) — là où `--name-status`
 * donne des chemins propres tab-séparés. On ne s'en sert que pour indexer les
 * compteurs par chemin final.
 */
function numstatNewPath(field: string): string {
  const brace = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) {
    const [, pre, , newMid, post] = brace;
    return `${pre}${newMid}${post}`.replace(/\/{2,}/g, "/");
  }
  const arrow = field.split(" => ");
  return (arrow.length === 2 ? arrow[1] : field).trim();
}

/**
 * Fichiers changés entre deux shas (le « diff par tour »). Deux passes git :
 * `--name-status` (statut + chemins propres, renommages compris) pour la liste, et
 * `--numstat` pour les compteurs +/− (fichier binaire → 0/0). Forme deux-points
 * seulement — le clone est shallow (depth 1). Best-effort : toute erreur (ou un sha
 * hors de l'historique shallow) renvoie une liste vide, ne casse jamais un tour.
 */
export async function changedFiles(
  sandbox: Sandbox,
  fromSha: string,
  toSha: string,
): Promise<{ files: ChangedFile[]; truncated: boolean }> {
  if (!fromSha || !toSha || fromSha === toSha) return { files: [], truncated: false };
  try {
    const [nameStatus, numstat] = await Promise.all([
      runShell(sandbox, `git diff --name-status --find-renames ${sq(fromSha)} ${sq(toSha)}`),
      runShell(sandbox, `git diff --numstat --find-renames ${sq(fromSha)} ${sq(toSha)}`),
    ]);
    if (nameStatus.exitCode !== 0) return { files: [], truncated: false };

    // Compteurs indexés par chemin APRÈS.
    const counts = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstat.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
      counts.set(numstatNewPath(parts.slice(2).join("\t")), { additions, deletions });
    }

    const files: ChangedFile[] = [];
    for (const line of nameStatus.stdout.split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0]?.[0] ?? "";
      let status: ChangedFile["status"];
      let path: string;
      let previousPath: string | undefined;
      if (code === "R") {
        status = "renamed";
        previousPath = parts[1] ?? "";
        path = parts[2] ?? previousPath;
      } else if (code === "A" || code === "C") {
        // Copie (C) = nouveau fichier côté cible → « ajouté » du point de vue lecteur.
        status = "added";
        path = parts[1] ?? "";
      } else if (code === "D") {
        status = "deleted";
        path = parts[1] ?? "";
      } else {
        status = "modified";
        path = parts[1] ?? "";
      }
      if (!path) continue;
      const c = counts.get(path) ?? { additions: 0, deletions: 0 };
      files.push({
        path,
        status,
        additions: c.additions,
        deletions: c.deletions,
        ...(previousPath ? { previousPath } : {}),
      });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    const truncated = files.length > CHANGED_FILES_CAP;
    return { files: truncated ? files.slice(0, CHANGED_FILES_CAP) : files, truncated };
  } catch {
    return { files: [], truncated: false };
  }
}

// ── Helpers fichiers (utilisés par les tools de l'agent) ─────────────────────

/** Nombre max de lignes renvoyées par un `read_file` sans offset/limit. */
export const READ_MAX_LINES = 2000;
/** Longueur max d'une ligne renvoyée (au-delà, tronquée). */
export const READ_MAX_LINE_CHARS = 2000;
/** Taille max d'un fichier lu (au-delà, on lit quand même mais on borne les lignes). */
export const READ_MAX_BYTES = 250_000;
/** Nombre max de fichiers renvoyés par `glob`. */
export const GLOB_MAX_FILES = 100;

/**
 * Chemin absolu et VALIDÉ d'un fichier du dépôt. Résout `..` et rejette toute
 * sortie de REPO_DIR (défense-en-profondeur : la microVM reste la vraie frontière,
 * mais un chemin `../../x` ne doit jamais toucher l'hôte).
 */
function repoPath(relPath: string): string {
  return resolveWithin(REPO_DIR, relPath);
}

/**
 * Chemin de LECTURE : le dépôt, plus les dossiers nommés de READABLE_DIRS (sorties
 * de tools déposées, MIN-107). Réservé aux tools qui LISENT — les écritures
 * passent par `writablePath` et restent enfermées dans le dépôt.
 */
function readablePath(path: string): string {
  return resolveReadable(REPO_DIR, READABLE_DIRS, path);
}

/** Le chemin résolu vise-t-il un dossier hors dépôt (donc hors de portée de git) ? */
function isOutsideRepo(absPath: string): boolean {
  return READABLE_DIRS.some((dir) => absPath === dir || absPath.startsWith(`${dir}/`));
}

/**
 * Comme repoPath mais pour les ÉCRITURES : refuse en plus `.git/` (écrire un hook
 * ou config = escalade possible — exfiltration du token d'installation, backdoor).
 */
function writablePath(relPath: string): string {
  const abs = repoPath(relPath);
  assertNotGit(REPO_DIR, abs, relPath);
  return abs;
}

/** Lit le contenu BRUT d'un fichier (utf8), ou null s'il n'existe pas. */
async function readFileAt(sandbox: Sandbox, absPath: string): Promise<string | null> {
  const buf = await sandbox.readFileToBuffer({ path: absPath });
  return buf ? buf.toString("utf8") : null;
}

/** Lit le contenu BRUT d'un fichier du dépôt (utf8), ou null s'il n'existe pas.
    Sert à l'édition (`edit_file`), qui a besoin du contenu exact non annoté. */
export async function readWorkFile(sandbox: Sandbox, relPath: string): Promise<string | null> {
  return readFileAt(sandbox, repoPath(relPath));
}

/**
 * Dépose une sortie de tool trop longue dans TOOL_OUTPUT_DIR et renvoie son chemin
 * ABSOLU (celui que le modèle repassera à `read_file`/`grep`). Ne passe PAS par
 * `writablePath` : on écrit volontairement hors du dépôt, et `name` est un simple
 * nom de fichier (tout séparateur est neutralisé ici).
 */
export async function writeToolOutput(
  sandbox: Sandbox,
  name: string,
  content: string,
): Promise<string> {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^\.+$/, "output") || "output";
  const abs = `${TOOL_OUTPUT_DIR}/${safe}`;
  await sandbox.mkDir(TOOL_OUTPUT_DIR).catch(() => {});
  await sandbox.writeFiles([{ path: abs, content }]);
  return abs;
}

// ── Jobs de fond (MIN-114) ───────────────────────────────────────────────────

/** Timeout du lancement d'un job (on n'attend que son PID, pas sa fin). */
const BACKGROUND_START_TIMEOUT_MS = 20_000;
/** Timeout d'une sonde / d'un arrêt. */
const BACKGROUND_PROBE_TIMEOUT_MS = 30_000;

/**
 * Les trois fichiers d'un job, dans TOOL_OUTPUT_DIR — donc HORS du dépôt (le
 * `git add -A` de fin de tour ne les voit jamais) et dans un dossier LISIBLE par
 * `read_file`/`grep` : le log complet d'un serveur reste consultable même quand la
 * sonde n'en a renvoyé que la queue (MIN-107).
 */
function backgroundPaths(jobId: string): BackgroundPaths {
  const safe = jobId.replace(/[^A-Za-z0-9._-]/g, "-") || "job";
  return {
    log: `${TOOL_OUTPUT_DIR}/${safe}.log`,
    pid: `${TOOL_OUTPUT_DIR}/${safe}.pid`,
    exit: `${TOOL_OUTPUT_DIR}/${safe}.exit`,
  };
}

/**
 * Lance une commande EN FOND et renvoie son PID (le script lui-même, et pourquoi
 * il est écrit ainsi, sont dans `background.ts` — module pur).
 */
export async function startBackground(
  sandbox: Sandbox,
  opts: { jobId: string; command: string; cwd?: string },
): Promise<{ pid: number; logPath: string }> {
  const p = backgroundPaths(opts.jobId);
  const launcher = backgroundStartScript(p, opts.command, TOOL_OUTPUT_DIR);

  const res = await runShell(sandbox, launcher, {
    cwd: opts.cwd,
    timeoutMs: BACKGROUND_START_TIMEOUT_MS,
  });
  const pid = Number.parseInt(res.stdout.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    const detail = (res.stderr || res.stdout).trim().slice(0, 300);
    throw new Error(`Could not start the background job${detail ? `: ${detail}` : "."}`);
  }
  return { pid, logPath: p.log };
}

/**
 * Sonde un job : ce qui a été écrit DEPUIS `offset`, plus son état. L'incrément est
 * borné à `maxBytes` pris à la FIN (un watcher bavard ne doit pas ramener 40 Mo par
 * sonde) ; l'offset avance quand même jusqu'à la taille réelle du log, et ce qui a
 * été sauté reste dans le fichier, lisible avec `grep`/`read_file`.
 */
export async function readBackgroundSince(
  sandbox: Sandbox,
  opts: { jobId: string; pid: number; offset: number; maxBytes: number },
): Promise<BackgroundChunk> {
  const p = backgroundPaths(opts.jobId);
  const offset = Math.max(0, Math.floor(opts.offset));
  const maxBytes = Math.max(1, Math.floor(opts.maxBytes));
  const res = await runShell(sandbox, backgroundProbeScript(p, opts.pid, offset, maxBytes), {
    timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS,
  });
  try {
    return parseBackgroundProbe(res.stdout, { offset, maxBytes });
  } catch {
    throw new Error(
      `Could not read the background job: ${(res.stderr || res.stdout).trim().slice(0, 300)}`,
    );
  }
}

/**
 * Arrête un job : SIGTERM, délai de grâce, puis SIGKILL (script dans
 * `background.ts`). Ne lève jamais sur un processus déjà mort.
 */
export async function stopBackground(sandbox: Sandbox, pid: number): Promise<void> {
  await runShell(sandbox, backgroundStopScript(pid), { timeoutMs: BACKGROUND_PROBE_TIMEOUT_MS });
}

export interface ReadWindow {
  /** Contenu annoté : une ligne `<n>\t<contenu>` par ligne source (1-based). */
  content: string;
  /** Nombre total de lignes du fichier. */
  totalLines: number;
  /** Index (1-based) de la première ligne renvoyée. */
  startLine: number;
  /** Nombre de lignes renvoyées. */
  returnedLines: number;
  /** true si des lignes ont été omises (fenêtre plus petite que le fichier). */
  truncated: boolean;
}

/**
 * Lit une FENÊTRE d'un fichier avec numéros de ligne (format `cat -n` : `n\t…`),
 * ce qui rend les éditions ciblables et borne le contexte. `offset` (1-based) et
 * `limit` fenêtrent ; par défaut les `READ_MAX_LINES` premières lignes. Les
 * lignes très longues sont tronquées. Renvoie null si le fichier n'existe pas.
 *
 * Accepte, en plus des chemins du dépôt, les sorties de tools déposées dans
 * TOOL_OUTPUT_DIR (MIN-107) : c'est ainsi que le modèle relit la sortie complète
 * d'un `run_command` trop long.
 */
export async function readWorkFileWindow(
  sandbox: Sandbox,
  relPath: string,
  opts?: { offset?: number; limit?: number },
): Promise<ReadWindow | null> {
  const raw = await readFileAt(sandbox, readablePath(relPath));
  if (raw === null) return null;

  const lines = raw.split("\n");
  // Un fichier finissant par `\n` (le cas courant) produit un dernier élément vide :
  // on le retire pour ne pas afficher une ligne numérotée fantôme (sémantique `cat -n`).
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const totalLines = lines.length;
  const startLine = Math.max(1, Math.floor(opts?.offset ?? 1));
  const limit = Math.max(1, Math.floor(opts?.limit ?? READ_MAX_LINES));
  const from = startLine - 1;
  const slice = lines.slice(from, from + limit);

  const numbered = slice.map((line, i) => {
    const n = startLine + i;
    const text = line.length > READ_MAX_LINE_CHARS ? `${line.slice(0, READ_MAX_LINE_CHARS)}… [line truncated]` : line;
    return `${n}\t${text}`;
  });

  return {
    content: numbered.join("\n"),
    totalLines,
    startLine,
    returnedLines: slice.length,
    truncated: from > 0 || from + slice.length < totalLines,
  };
}

/** Écrit (crée/écrase) un fichier du dépôt. Crée les dossiers parents si besoin.
    Rejette les écritures hors dépôt ou dans `.git/`. */
export async function writeWorkFile(sandbox: Sandbox, relPath: string, content: string): Promise<void> {
  const abs = writablePath(relPath);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  if (dir) await sandbox.mkDir(dir).catch(() => {});
  await sandbox.writeFiles([{ path: abs, content }]);
}

/**
 * Déplace/renomme un fichier suivi (git mv). Refuse la sortie du dépôt / `.git/`
 * des deux côtés, et l'écrasement d'une destination existante. Passe par git pour
 * que le commit/PR capture le renommage.
 */
export async function moveWorkFile(sandbox: Sandbox, from: string, to: string): Promise<void> {
  const src = writablePath(from);
  const dst = writablePath(to);
  const dstDir = dst.slice(0, dst.lastIndexOf("/"));
  const cmd = [
    `set -e`,
    `test -e ${sq(src)} || { echo "source not found" >&2; exit 3; }`,
    `test -e ${sq(dst)} && { echo "destination exists" >&2; exit 4; }`,
    dstDir ? `mkdir -p ${sq(dstDir)}` : `:`,
    // git mv si le fichier est suivi, sinon mv simple (fichier neuf non commité).
    `git mv ${sq(src)} ${sq(dst)} 2>/dev/null || mv ${sq(src)} ${sq(dst)}`,
  ].join("\n");
  const res = await runShell(sandbox, cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "move failed");
}

/** Supprime un fichier suivi (git rm) ou neuf. Refuse hors dépôt / `.git/`. */
export async function deleteWorkFile(sandbox: Sandbox, relPath: string): Promise<void> {
  const abs = writablePath(relPath);
  const cmd = [
    `test -e ${sq(abs)} || { echo "file not found" >&2; exit 3; }`,
    `git rm -f ${sq(abs)} 2>/dev/null || rm -f ${sq(abs)}`,
  ].join("\n");
  const res = await runShell(sandbox, cmd);
  if (res.exitCode !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || "delete failed");
}

/** Liste le contenu d'un dossier du dépôt — ou de TOOL_OUTPUT_DIR, pour retrouver
    les sorties déposées (noms, dossiers suffixés `/`). */
export async function listDir(sandbox: Sandbox, relPath = "."): Promise<string> {
  const res = await runShell(sandbox, `ls -1Ap ${sq(readablePath(relPath))}`);
  return res.stdout;
}

export type GrepOutputMode = "content" | "files_with_matches" | "count";

export interface GrepOptions {
  /** Motif (regex étendue POSIX). */
  pattern: string;
  /** Sous-arbre à limiter (pathspec). */
  path?: string;
  /** Glob de fichiers, ex. `**\/*.ts` (pathspec `:(glob)`). */
  glob?: string;
  outputMode?: GrepOutputMode;
  /** Insensible à la casse. */
  ignoreCase?: boolean;
  /** Lignes de contexte autour de chaque match (mode `content`). */
  context?: number;
  /** Cap de lignes renvoyées. */
  headLimit?: number;
  /** Cherche le motif comme une chaîne LITTÉRALE (`-F`), sans le lire comme une regex. */
  fixedStrings?: boolean;
}

export interface GrepResult {
  /** Lignes de sortie (peut être vide = aucun match). */
  output: string;
  /** false → git grep a ÉCHOUÉ (regex/option invalide) — pas « aucun match ». */
  ok: boolean;
  /** Message d'erreur si ok=false. */
  error?: string;
  /** Le motif n'était pas une regex valide : relancé en littéral (MIN-109). */
  retriedAsLiteral?: boolean;
}

/**
 * Recherche via `git grep` : gitignore-aware (fichiers suivis + non suivis, hors
 * ignorés), rapide, sans dépendance à installer. `content` → `fichier:ligne:…`,
 * `files_with_matches` → chemins, `count` → `fichier:compte`. `path` et `glob`
 * s'INTERSECTENT (glob dans path). Les erreurs git (regex invalide, option
 * invalide) NE sont PAS masquées : on lit l'exit code (≥2 = erreur) au lieu de
 * `|| true`/`| head` qui les avaleraient — le cap de lignes se fait en JS.
 * Seule exception (MIN-109) : un motif refusé comme regex est relancé en littéral
 * (`-F`), et le retour le DIT (`retriedAsLiteral`).
 */
export async function grepRepo(sandbox: Sandbox, opts: GrepOptions): Promise<GrepResult> {
  // Le `path` vise-t-il un dossier lisible HORS dépôt (une sortie de tool déposée,
  // MIN-107) ? git grep n'y voit rien — on passe au grep du système.
  const outside = opts.path ? readableOutsideRepo(opts.path) : null;
  if (outside) return grepOutside(sandbox, opts, outside);

  const specs = grepPathspecs(opts.path, opts.glob).map(sq);
  const pathspecPart = specs.length ? ` -- ${specs.join(" ")}` : "";
  const build = (literal: boolean) => {
    const flags = [
      "--no-color",
      "-I",
      literal ? "-F" : "-E",
      "--untracked",
      ...grepModeFlags(opts),
    ];
    return `git grep ${flags.join(" ")} -e ${sq(opts.pattern)}${pathspecPart}`;
  };
  const { res, retriedAsLiteral } = await runGrepWithLiteralFallback(sandbox, build, opts);

  // git grep : 0 = matchs, 1 = aucun match, ≥2 = ERREUR (regex/option invalide…).
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  return { output: capGrepLines(res.stdout, opts.headLimit), ok: true, retriedAsLiteral };
}

/**
 * Lance la recherche, et si le moteur a refusé le MOTIF (pas une regex valide),
 * la relance en littéral (`-F`) — le cas de loin le plus courant (MIN-109) : le
 * modèle colle un bout de code (`onUpdateIssue={`) en croyant chercher du texte.
 * Toute autre erreur (option, pathspec) remonte telle quelle.
 */
async function runGrepWithLiteralFallback(
  sandbox: Sandbox,
  build: (literal: boolean) => string,
  opts: GrepOptions,
): Promise<{ res: ShellResult; retriedAsLiteral: boolean }> {
  const literal = opts.fixedStrings === true;
  const res = await runShell(sandbox, build(literal));
  if (literal || res.exitCode < 2 || !isInvalidRegexError(res.stderr || res.stdout)) {
    return { res, retriedAsLiteral: false };
  }
  return { res: await runShell(sandbox, build(true)), retriedAsLiteral: true };
}

/** Drapeaux partagés par les deux moteurs (casse, mode de sortie, contexte). */
function grepModeFlags(opts: GrepOptions): string[] {
  const flags: string[] = [];
  if (opts.ignoreCase) flags.push("-i");
  const mode = opts.outputMode ?? "content";
  if (mode === "files_with_matches") flags.push("-l");
  else if (mode === "count") flags.push("-c");
  else {
    flags.push("-n");
    const ctx = opts.context != null ? Math.floor(opts.context) : 0;
    if (ctx > 0) flags.push(`-C ${Math.min(ctx, 20)}`);
  }
  return flags;
}

/** Cap de lignes appliqué en JS (jamais `| head`, qui masquerait l'exit code). */
function capGrepLines(output: string, headLimit?: number): string {
  if (headLimit == null || headLimit <= 0) return output;
  return output.split("\n").slice(0, Math.floor(headLimit)).join("\n");
}

/** Chemin absolu validé s'il vise un dossier lisible hors dépôt, sinon null.
    Lève si un `..` tentait d'en sortir. */
function readableOutsideRepo(path: string): string | null {
  if (!READABLE_DIRS.some((dir) => path === dir || path.startsWith(`${dir}/`))) return null;
  return readablePath(path);
}

/**
 * Recherche dans un dossier lisible hors dépôt (sorties de tools déposées) avec le
 * grep du système : `-r` pour un dossier, `-H` pour toujours préfixer le chemin
 * (le modèle doit pouvoir le repasser à `read_file`). Mêmes codes de sortie que
 * git grep (0 match, 1 rien, ≥2 erreur), donc même contrat de retour.
 */
async function grepOutside(
  sandbox: Sandbox,
  opts: GrepOptions,
  absPath: string,
): Promise<GrepResult> {
  const build = (literal: boolean) => {
    const flags = [
      "--color=never",
      "-I",
      literal ? "-F" : "-E",
      "-r",
      "-H",
      ...grepModeFlags(opts),
    ];
    if (opts.glob) flags.push(`--include=${sq(opts.glob)}`);
    return `grep ${flags.join(" ")} -e ${sq(opts.pattern)} -- ${sq(absPath)}`;
  };
  const { res, retriedAsLiteral } = await runGrepWithLiteralFallback(sandbox, build, opts);
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  return { output: capGrepLines(res.stdout, opts.headLimit), ok: true, retriedAsLiteral };
}

export interface GlobResult {
  files: string[];
  truncated: boolean;
}

/**
 * Liste les fichiers du dépôt correspondant à un glob (pathspec `:(glob)`),
 * gitignore-aware (suivis + non suivis, hors ignorés). `path` et `pattern`
 * s'INTERSECTENT (glob dans path). Tri + cap (`GLOB_MAX_FILES`) faits en JS pour
 * ne pas masquer l'exit code de git derrière un pipe.
 */
export async function globRepo(
  sandbox: Sandbox,
  pattern: string,
  path?: string,
): Promise<GlobResult> {
  const spec = sq(globPathspec(pattern, path));
  const cmd = `git ls-files --cached --others --exclude-standard -- ${spec}`;
  const res = await runShell(sandbox, cmd);
  if (res.exitCode !== 0) return { files: [], truncated: false }; // pathspec invalide, etc.

  const all = res.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
  return { files: all.slice(0, GLOB_MAX_FILES), truncated: all.length > GLOB_MAX_FILES };
}
