import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * LE CHECKOUT ISOLÉ D'UN TOUR LOCAL.
 *
 * Le dépôt attaché reste le point d'ancrage humain : c'est lui qui porte les
 * remotes, les credentials et, potentiellement, du travail non commité. Un
 * worktree est créé sous la racine propre au run, sur un HEAD détaché. Ainsi le
 * harnais peut utiliser le chemin normal de livraison (commit + push) sans
 * déplacer la branche, l'index ou l'arbre de travail de la personne.
 */

export function localWorktreePath(runRoot: string): string {
  return path.join(runRoot, "repo");
}

export type LocalWorktreeResult =
  | { readonly ok: true; readonly path: string; readonly reused: boolean }
  | { readonly ok: false; readonly message: string };

/**
 * Crée ou retrouve le worktree d'un run.
 *
 * `git worktree add --detach` est volontaire : la branche de livraison n'est
 * pas checkoutée dans le dépôt attaché et ne peut donc pas déplacer le travail
 * de quelqu'un. Le harnais pousse ensuite son HEAD détaché vers `workBranch`.
 */
export function prepareLocalWorktree(opts: {
  sourceRepo: string;
  runRoot: string;
  baseBranch?: string | null;
  workBranch: string;
  authUrl?: string;
}): LocalWorktreeResult {
  const destination = localWorktreePath(opts.runRoot);
  const source = path.resolve(opts.sourceRepo);
  const wanted = path.resolve(destination);

  try {
    // Une racine supprimée par le ménage laisse une entrée administrative dans
    // le dépôt source. Git sait les retirer, sans toucher au checkout humain.
    git(source, ["worktree", "prune"]);
    const registered = git(source, ["worktree", "list", "--porcelain"])
      .split("\n")
      .some((line) => line.startsWith("worktree ") && path.resolve(line.slice(9)) === wanted);
    if (registered) {
      return { ok: true, path: destination, reused: true };
    }
    if (existsSync(destination)) {
      return {
        ok: false,
        message: "The isolated worktree folder already exists but is not registered by Git.",
      };
    }

    mkdirSync(path.dirname(destination), { recursive: true });
    const base = localBaseRef(source, opts.runRoot, opts.baseBranch, opts.authUrl);
    git(source, ["worktree", "add", "--detach", destination, base]);

    // Une session reprise peut avoir déjà poussé sa branche depuis une autre
    // machine. Reprendre ce tip est le pendant local de `cloneRepo`; l'absence
    // de branche est normale pour le premier tour et laisse la base checkoutée.
    if (opts.authUrl?.trim() && opts.workBranch.trim()) {
      const fetched = tryGit(destination, ["fetch", "--quiet", opts.authUrl, opts.workBranch]);
      if (fetched) git(destination, ["checkout", "--detach", "FETCH_HEAD"]);
    }
    return { ok: true, path: destination, reused: false };
  } catch {
    // Les diagnostics bruts de git peuvent contenir l'URL authentifiée. Le
    // journal du lanceur ne reçoit donc qu'un motif sans secret.
    return { ok: false, message: "Git could not create the isolated worktree." };
  }
}

/**
 * Une branche proposée par le picker peut ne pas encore exister localement. On
 * la ramène alors sous une ref privée à minddy, sans créer ou déplacer une
 * branche visible dans le checkout attaché. C'est la même promesse que le mode
 * checkout courant, mais le worktree peut ensuite partir exactement de la base
 * demandée plutôt que du HEAD de la personne.
 */
function localBaseRef(
  sourceRepo: string,
  runRoot: string,
  baseBranch: string | null | undefined,
  authUrl: string | undefined,
): string {
  const branch = baseBranch?.trim();
  if (!branch) return "HEAD";
  const localRef = `refs/heads/${branch}`;
  if (tryGit(sourceRepo, ["rev-parse", "--verify", "--quiet", `${localRef}^{commit}`])) {
    return localRef;
  }
  if (!authUrl?.trim()) return localRef;

  const run = path.basename(runRoot).replace(/[^A-Za-z0-9_-]/g, "-") || "run";
  const privateRef = `refs/minddy/worktree/${run}/base`;
  const fetched = tryGit(sourceRepo, [
    "fetch",
    "--no-tags",
    "--quiet",
    authUrl,
    `+refs/heads/${branch}:${privateRef}`,
  ]);
  return fetched ? privateRef : localRef;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryGit(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}
