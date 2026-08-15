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

/**
 * Résout un chemin de LECTURE (MIN-107) : soit dans le dépôt (`resolveWithin`),
 * soit sous l'un des `readableDirs` — des dossiers de la microVM hors dépôt où le
 * harness dépose des choses à relire (les sorties longues de `run_command`).
 * Le chemin doit être donné ABSOLU pour viser un `readableDir` : tout le reste
 * reste relatif au dépôt, comme avant. Un `..` qui sortirait du dossier visé LÈVE
 * — on n'ouvre jamais le filesystem, on nomme des exceptions.
 * Les ÉCRITURES ne passent jamais par ici (cf. `assertNotGit` / `writablePath`).
 */
export function resolveReadable(
  baseDir: string,
  readableDirs: string[],
  path: string,
): string {
  for (const dir of readableDirs) {
    if (path !== dir && !path.startsWith(`${dir}/`)) continue;
    const resolved = posixPath.normalize(path);
    if (resolved !== dir && !resolved.startsWith(`${dir}/`)) {
      throw new Error(`Path escapes the readable directory: ${path}`);
    }
    return resolved;
  }
  return resolveWithin(baseDir, path);
}

/**
 * Lève si `absPath` (déjà résolu sous `baseDir`) vise un `.git/` — écritures
 * interdites.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX ÉLARGISSEMENTS QUE LE DISQUE RÉEL IMPOSE (MIN-360)
 *
 * La comparaison était un préfixe brut sur la racine du dépôt, et elle tenait tant
 * que le dépôt était un clone jetable sur un ext4 de microVM :
 *
 * - **la casse.** APFS est insensible à la casse : `.GIT/hooks/pre-commit` désigne
 *   exactement le même fichier que `.git/hooks/pre-commit`, et n'était pas reconnu.
 *   On replie donc les deux côtés avant de comparer ;
 * - **la profondeur.** Seul le `.git` de la RACINE était gardé. Un dépôt en porte
 *   d'autres (sous-modules, dépôt imbriqué, fixture de test), et un hook y a
 *   exactement le même pouvoir. Un segment `.git` est donc refusé **où qu'il soit**
 *   dans le chemin.
 *
 * Ce qui n'est PAS ici, et qui doit se dire : le lien symbolique. `ln -s` n'est vu
 * par aucun garde-fou, et un lien créé DANS le dépôt satisfait cette validation
 * tout en pointant ailleurs. Ça demande le disque, donc `realpath`, donc une
 * fonction asynchrone — elle vit dans [vm/local-guard.ts](vm/local-guard.ts), et
 * c'est le superviseur qui l'applique. Celle-ci reste pure.
 */
export function assertNotGit(baseDir: string, absPath: string, relPath: string): void {
  const base = baseDir.toLowerCase();
  const target = absPath.toLowerCase();
  // On n'inspecte que ce qui est SOUS le dépôt : la racine, elle, est donnée par
  // le harness, et un `.git` qui s'y trouverait ne viendrait pas du modèle.
  const inside =
    target === base ? "" : target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target;
  if (inside.split("/").includes(".git")) {
    throw new Error(`Refusing to write inside .git: ${relPath}`);
  }
}
