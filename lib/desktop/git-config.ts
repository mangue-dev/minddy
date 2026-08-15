import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { parseGitDirPointer, type LocalRepoFacts } from "./local-repo";

/**
 * CE QUE LE DISQUE DIT D'UN DOSSIER CANDIDAT (MIN-359).
 *
 * Séparé de [local-repo.ts](local-repo.ts), qui reste sans IO, et séparé aussi de
 * `desktop/src/`, qui importe `electron` : **c'est ce placement qui rend ce
 * fichier testable.** `vitest.config.ts` ne collecte que `lib/**`, et un module
 * qui importe `electron` ne s'y importe pas — or la lecture ci-dessous est
 * précisément la partie qu'aucune relecture ne valide (voir le double saut du
 * worktree). Elle a donc son test contre de vrais dépôts,
 * [git-config.git.test.ts](git-config.git.test.ts).
 *
 * ⚠ **Ce module importe `node:fs` : il n'a rien à faire dans un composant
 * client.** Il n'est appelé que par le main process de la coquille.
 *
 * ## On lit `.git/config`, on ne lance pas `git`
 *
 * Sur un Mac sans Command Line Tools, la moindre invocation de `git` fait surgir
 * la fenêtre d'installation de Xcode. Au milieu d'un geste de réglage, personne
 * ne comprend d'où elle sort — et l'app n'a aucun moyen de la refermer. Le
 * fichier suffit, il est là par construction, et sa lecture ne dépend de rien.
 *
 * ## Le `.git` n'est pas toujours un dossier
 *
 * Dans un **worktree** et dans un **sous-module**, `.git` est un FICHIER portant
 * `gitdir: <chemin>` — et dans un worktree, la configuration ne vit pas là : le
 * fichier `commondir` renvoie au `.git` du dépôt principal, seul endroit où les
 * remotes sont déclarés. On suit donc les deux sauts. Sans eux, attacher un
 * worktree — exactement ce que fait quelqu'un qui travaille sur deux branches à
 * la fois — serait refusé comme « pas un dépôt ».
 */

/** L'état d'un dossier, tel que `localRepoVerdict` le veut. */
export function readGitFacts(dir: string): LocalRepoFacts {
  try {
    if (!statSync(dir).isDirectory()) return { isDirectory: false, gitConfig: null };
  } catch {
    return { isDirectory: false, gitConfig: null };
  }
  return { isDirectory: true, gitConfig: readGitConfig(dir) };
}

/** Le `.git/config` du dossier, en suivant worktree et sous-module. */
export function readGitConfig(dir: string): string | null {
  const dotGit = path.join(dir, ".git");
  let gitDir: string;
  try {
    if (statSync(dotGit).isDirectory()) {
      gitDir = dotGit;
    } else {
      const pointer = parseGitDirPointer(readFileSync(dotGit, "utf8"));
      if (!pointer) return null;
      gitDir = path.resolve(dir, pointer);
    }
  } catch {
    return null;
  }

  // `commondir` n'existe QUE dans un worktree.
  let configDir = gitDir;
  try {
    const common = readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    if (common) configDir = path.resolve(gitDir, common);
  } catch {
    // Pas un worktree : la configuration est dans le gitdir lui-même.
  }

  try {
    return readFileSync(path.join(configDir, "config"), "utf8");
  } catch {
    return null;
  }
}

/**
 * Le chemin PHYSIQUE d'un dossier — liens symboliques résolus.
 *
 * Ce n'est pas de la coquetterie, et le dépôt l'a déjà payé une fois : la
 * préparation du dépôt courant compare le chemin qu'on lui donne à ce que rend
 * `git rev-parse --show-toplevel`, **qui est physique**
 * ([current-repo.git.test.ts](../server/agent/current-repo.git.test.ts) le dit
 * en toutes lettres). Ranger le chemin tel que le panneau système l'a rendu —
 * `/tmp/…` alors que le vrai est `/private/tmp/…`, ou n'importe quel raccourci
 * que quelqu'un s'est fait dans son home — ferait échouer le premier tour sur
 * une comparaison de chaînes, et le message ne parlerait pas de liens
 * symboliques.
 */
export function realRepoPath(dir: string): string | null {
  try {
    return realpathSync(dir);
  } catch {
    return null;
  }
}
