import "server-only";

import { Sandbox } from "@vercel/sandbox";

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

// ── Helpers fichiers (utilisés par les tools de l'agent, Phase 2) ────────────

/** Chemin absolu d'un fichier du dépôt à partir d'un chemin relatif. */
function repoPath(relPath: string): string {
  return `${REPO_DIR}/${relPath.replace(/^\/+/, "")}`;
}

/** Lit un fichier du dépôt (utf8), ou null s'il n'existe pas. */
export async function readWorkFile(sandbox: Sandbox, relPath: string): Promise<string | null> {
  const buf = await sandbox.readFileToBuffer({ path: repoPath(relPath) });
  return buf ? buf.toString("utf8") : null;
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

/**
 * Recherche `pattern` dans les fichiers du dépôt (hors .git). Renvoie les lignes
 * `fichier:ligne:contenu`. L'appelant tronque si nécessaire.
 */
export async function grepRepo(sandbox: Sandbox, pattern: string): Promise<string> {
  const res = await runShell(
    sandbox,
    `grep -rn --exclude-dir=.git -e ${sq(pattern)} . || true`,
  );
  return res.stdout;
}
