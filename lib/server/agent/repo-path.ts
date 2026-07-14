import { posix as posixPath } from "node:path";

/**
 * Validation de chemins de l'agent de code (MIN-46). PUR et testable — la logique
 * est sécurité-critique (empêche qu'un chemin `../../x` sorte du dépôt cloné).
 */

/**
 * Résout `relPath` sous `baseDir` en normalisant `..`, et LÈVE si le résultat sort
 * de `baseDir`. `baseDir` doit être un chemin absolu POSIX sans slash final.
 */
export function resolveWithin(baseDir: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+/, "");
  const resolved = posixPath.normalize(`${baseDir}/${cleaned}`);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}/`)) {
    throw new Error(`Path escapes the repository: ${relPath}`);
  }
  return resolved;
}

/** Lève si `absPath` (déjà résolu sous `baseDir`) vise `.git/` (écritures interdites). */
export function assertNotGit(baseDir: string, absPath: string, relPath: string): void {
  if (absPath === `${baseDir}/.git` || absPath.startsWith(`${baseDir}/.git/`)) {
    throw new Error(`Refusing to write inside .git: ${relPath}`);
  }
}
