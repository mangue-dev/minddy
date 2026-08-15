import { dialog, type BrowserWindow } from "electron";

import { readGitFacts, realRepoPath } from "@/lib/desktop/git-config";
import {
  localRepoFolderName,
  localRepoVerdict,
  withLocalRepo,
  withoutLocalRepo,
  type ExpectedRepo,
  type LocalRepoState,
} from "@/lib/desktop/local-repo";
import { readLocalRepos, writeLocalRepos } from "./repo-store";

/**
 * ATTACHER UN DOSSIER DE LA MACHINE À UN PROJET (MIN-359) — le câblage.
 *
 * Ce que la page peut demander : ouvrir le panneau système, relire
 * l'attachement, l'oublier. **Elle ne peut jamais NOMMER un dossier** — le pont
 * ne prend pas de chemin en entrée (cf. lib/desktop/bridge.ts). Un chemin ne
 * redescend que pour être affiché, et il ne remonte que d'un `NSOpenPanel`,
 * c'est-à-dire d'un geste humain. C'est la seule forme qui rende le code distant
 * incapable de désigner `~/.ssh` en écrivant une chaîne.
 *
 * Tout ce qui se décide vit ailleurs, et c'est délibéré : les verdicts dans
 * [lib/desktop/local-repo.ts](../../lib/desktop/local-repo.ts) (pur), la lecture
 * du disque dans [lib/desktop/git-config.ts](../../lib/desktop/git-config.ts) —
 * hors de `desktop/src/`, où la suite de tests ne va pas. Il ne reste ici que le
 * panneau, le rangement, et la question « quel état rendre ».
 */

/** L'état d'un chemin donné, revalidé contre le dépôt lié au projet. */
function stateFor(dirPath: string, expected: ExpectedRepo): LocalRepoState {
  const verdict = localRepoVerdict(readGitFacts(dirPath), expected);
  return verdict.ok
    ? { status: "ready", path: dirPath, folder: localRepoFolderName(dirPath) }
    : { status: "invalid", path: dirPath, reason: verdict.reason };
}

/**
 * L'attachement d'un projet, **revalidé à chaque lecture**.
 *
 * Un chemin retenu ne prouve rien : le dossier a pu être déplacé, le disque
 * démonté, le dépôt du projet re-lié ailleurs entre-temps. Répondre « attaché »
 * sur la foi du fichier ferait partir un run vers un dossier qui n'existe plus,
 * et la panne n'apparaîtrait qu'au premier tour, sur la machine, sans log.
 */
export function describeLocalRepo(
  projectId: string,
  expected: ExpectedRepo,
): LocalRepoState {
  const stored = readLocalRepos()[projectId];
  if (!stored) return { status: "none" };
  return stateFor(stored, expected);
}

/**
 * Ouvre le panneau système et attache le dossier choisi.
 *
 * **Un dossier refusé n'est pas rangé** : on rend le verdict pour que l'écran le
 * dise, et l'attachement précédent — s'il y en avait un — reste en place. Se
 * tromper de dossier ne doit pas coûter celui qui marchait.
 *
 * Une annulation rend l'état courant, comme si rien ne s'était passé.
 *
 * Le chemin est **résolu** avant d'être rangé (`realRepoPath`) : cf. le
 * commentaire de cette fonction, c'est ce qui évite qu'un lien symbolique fasse
 * échouer le premier tour sur une comparaison de chaînes.
 */
export async function attachLocalRepo(
  projectId: string,
  expected: ExpectedRepo,
  window: BrowserWindow | null,
): Promise<LocalRepoState> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory"],
    message: `Choisir le dossier local de ${expected.fullName}`,
    buttonLabel: "Attacher",
  };
  const picked = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  const chosen = picked.canceled ? null : (picked.filePaths[0] ?? null);
  if (!chosen) return describeLocalRepo(projectId, expected);

  const resolved = realRepoPath(chosen);
  if (!resolved) return { status: "invalid", path: chosen, reason: "missing" };

  const state = stateFor(resolved, expected);
  if (state.status !== "ready") return state;

  writeLocalRepos(withLocalRepo(readLocalRepos(), projectId, resolved));
  return state;
}

/** Détache le dossier. Rend l'état d'après, qui est toujours « aucun ». */
export function detachLocalRepo(projectId: string): LocalRepoState {
  writeLocalRepos(withoutLocalRepo(readLocalRepos(), projectId));
  return { status: "none" };
}
