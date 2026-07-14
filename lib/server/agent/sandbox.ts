import "server-only";

import { Sandbox } from "@vercel/sandbox";

import { grepPathspecs, globPathspec } from "./git-pathspec";

/**
 * Couche Vercel Sandbox de l'agent de code (MIN-46) — les « mains » de l'agent.
 * Une microVM isolée (node24) où l'on clone le dépôt lié, édite, lance
 * install/build/tests, commit et push. Le reste de l'agent (boucle LLM, tools,
 * orchestration) est bâti au-dessus dans lib/server/agent/*.
 *
 * IDENTITÉ & REPRISE : un Sandbox est identifié par son `name` (persisté dans
 * agent_runs.sandbox_id). `createOrReconnectSandbox` tente d'abord de rejoindre
 * la microVM encore vivante ; si elle a expiré, il en crée une neuve et
 * l'appelant re-clone la branche de travail (l'état du repo est durable dans git,
 * pas dans le Sandbox). AUTH : réutilise VERCEL_TOKEN/TEAM_ID/PROJECT_ID (comme
 * les domaines custom, MIN-36) ; sur Vercel l'OIDC suffit.
 */

/** Runtime de la microVM. */
const SANDBOX_RUNTIME = "node24";
/** Durée de vie max de la microVM (elle doit survivre au gap entre deux chunks). */
const SANDBOX_TIMEOUT_MS = 45 * 60_000;
/** Où le dépôt est cloné dans la microVM. */
export const REPO_DIR = "/vercel/sandbox/repo";
/** Home par défaut du Sandbox (parent de REPO_DIR). */
const SANDBOX_HOME = "/vercel/sandbox";

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
 * Rejoint la microVM `sandboxName` si elle est encore vivante, sinon en crée une
 * neuve (depuis le snapshot AGENT_SANDBOX_SNAPSHOT_ID si présent, pour un boot
 * quasi instantané). `reconnected=false` signale à l'appelant qu'il faut
 * re-cloner la branche de travail.
 */
export async function createOrReconnectSandbox(
  sandboxName?: string | null,
): Promise<{ sandbox: Sandbox; reconnected: boolean }> {
  const creds = sandboxCredentials();

  if (sandboxName) {
    try {
      const sandbox = await Sandbox.get({ ...creds, name: sandboxName, resume: true });
      return { sandbox, reconnected: true };
    } catch {
      // Expirée / introuvable → on repart d'une microVM neuve.
    }
  }

  const snapshotId = process.env.AGENT_SANDBOX_SNAPSHOT_ID?.trim();
  const sandbox = snapshotId
    ? await Sandbox.create({ ...creds, source: { type: "snapshot", snapshotId }, timeout: SANDBOX_TIMEOUT_MS })
    : await Sandbox.create({ ...creds, runtime: SANDBOX_RUNTIME, timeout: SANDBOX_TIMEOUT_MS });

  return { sandbox, reconnected: false };
}

/** Nom stable de la microVM à persister dans agent_runs.sandbox_id. */
export function sandboxName(sandbox: Sandbox): string {
  return sandbox.name;
}

/** Arrête la microVM (best-effort — ne lève jamais). */
export async function stopSandbox(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.stop();
  } catch {
    // best-effort : la microVM finira par expirer d'elle-même.
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
  opts: { authUrl: string; baseBranch: string; workBranch: string },
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
    `git config user.email "agent@minddy.app"`,
    `git config user.name "minddy agent"`,
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
 * Renvoie le sha de HEAD et si un commit a été créé.
 */
export async function commitAndPush(
  sandbox: Sandbox,
  opts: { authUrl: string; workBranch: string; message: string },
): Promise<{ committed: boolean; headSha: string }> {
  const status = await runShell(sandbox, `git status --porcelain`);
  const dirty = status.stdout.trim().length > 0;

  if (dirty) {
    const staged = await runShell(sandbox, `git add -A`);
    if (staged.exitCode !== 0) throw new Error(`git add failed: ${staged.stderr || staged.stdout}`);
    const commit = await runShell(sandbox, `git commit -m ${sq(opts.message)}`);
    if (commit.exitCode !== 0) throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const push = await runShell(
    sandbox,
    `git push ${sq(opts.authUrl)} ${sq(`HEAD:refs/heads/${opts.workBranch}`)}`,
    { timeoutMs: 120_000 },
  );
  if (push.exitCode !== 0) throw new Error(`git push failed: ${push.stderr || push.stdout}`);

  const head = await runShell(sandbox, `git rev-parse HEAD`);
  return { committed: dirty, headSha: head.stdout.trim() };
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

/** Chemin absolu d'un fichier du dépôt à partir d'un chemin relatif. */
function repoPath(relPath: string): string {
  return `${REPO_DIR}/${relPath.replace(/^\/+/, "")}`;
}

/** Lit le contenu BRUT d'un fichier du dépôt (utf8), ou null s'il n'existe pas.
    Sert à l'édition (`edit_file`), qui a besoin du contenu exact non annoté. */
export async function readWorkFile(sandbox: Sandbox, relPath: string): Promise<string | null> {
  const buf = await sandbox.readFileToBuffer({ path: repoPath(relPath) });
  return buf ? buf.toString("utf8") : null;
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
 */
export async function readWorkFileWindow(
  sandbox: Sandbox,
  relPath: string,
  opts?: { offset?: number; limit?: number },
): Promise<ReadWindow | null> {
  const raw = await readWorkFile(sandbox, relPath);
  if (raw === null) return null;

  const lines = raw.split("\n");
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

/** Écrit (crée/écrase) un fichier du dépôt. Crée les dossiers parents si besoin. */
export async function writeWorkFile(sandbox: Sandbox, relPath: string, content: string): Promise<void> {
  const abs = repoPath(relPath);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  if (dir) await sandbox.mkDir(dir).catch(() => {});
  await sandbox.writeFiles([{ path: abs, content }]);
}

/** Liste le contenu d'un dossier du dépôt (noms, dossiers suffixés `/`). */
export async function listDir(sandbox: Sandbox, relPath = "."): Promise<string> {
  const res = await runShell(sandbox, `ls -1Ap ${sq(repoPath(relPath))}`);
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
}

export interface GrepResult {
  /** Lignes de sortie (peut être vide = aucun match). */
  output: string;
  /** false → git grep a ÉCHOUÉ (regex/option invalide) — pas « aucun match ». */
  ok: boolean;
  /** Message d'erreur si ok=false. */
  error?: string;
}

/**
 * Recherche via `git grep` : gitignore-aware (fichiers suivis + non suivis, hors
 * ignorés), rapide, sans dépendance à installer. `content` → `fichier:ligne:…`,
 * `files_with_matches` → chemins, `count` → `fichier:compte`. `path` et `glob`
 * s'INTERSECTENT (glob dans path). Les erreurs git (regex invalide, option
 * invalide) NE sont PAS masquées : on lit l'exit code (≥2 = erreur) au lieu de
 * `|| true`/`| head` qui les avaleraient — le cap de lignes se fait en JS.
 */
export async function grepRepo(sandbox: Sandbox, opts: GrepOptions): Promise<GrepResult> {
  const flags: string[] = ["--no-color", "-I", "-E", "--untracked"];
  if (opts.ignoreCase) flags.push("-i");
  const mode = opts.outputMode ?? "content";
  if (mode === "files_with_matches") flags.push("-l");
  else if (mode === "count") flags.push("-c");
  else {
    flags.push("-n");
    const ctx = opts.context != null ? Math.floor(opts.context) : 0;
    if (ctx > 0) flags.push(`-C ${Math.min(ctx, 20)}`);
  }

  const specs = grepPathspecs(opts.path, opts.glob).map(sq);
  const pathspecPart = specs.length ? ` -- ${specs.join(" ")}` : "";
  const cmd = `git grep ${flags.join(" ")} -e ${sq(opts.pattern)}${pathspecPart}`;
  const res = await runShell(sandbox, cmd);

  // git grep : 0 = matchs, 1 = aucun match, ≥2 = ERREUR (regex/option invalide…).
  if (res.exitCode >= 2) {
    return { output: "", ok: false, error: (res.stderr || res.stdout).trim().slice(0, 500) };
  }
  let output = res.stdout;
  if (opts.headLimit != null && opts.headLimit > 0) {
    output = output.split("\n").slice(0, Math.floor(opts.headLimit)).join("\n");
  }
  return { output, ok: true };
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
