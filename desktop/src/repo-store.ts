import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  parseLocalRepoStore,
  serializeLocalRepoStore,
  type LocalRepoStore,
} from "@/lib/desktop/local-repo";

/**
 * Les dossiers attachés, retenus d'un lancement à l'autre (MIN-359).
 *
 * Même patron que [channel-store.ts](channel-store.ts), et pour une raison de
 * plus : **ce réglage n'a de sens que sur cette machine.** Un chemin de home ne
 * veut rien dire ailleurs ; le ranger côté serveur le publierait, faux, à tous
 * les membres du projet. Il vit donc dans `userData`, à côté du canal et de la
 * session, sous le nom d'app posé par `main.ts`.
 *
 * ⚠ Le dossier CHANGE en développement (`minddy-dev`, cf. `app.setName`) : la
 * coquille de dév et l'app installée n'ont pas les mêmes attachements. C'est
 * cohérent avec le reste, et ça évite qu'une session de dév redirige les runs de
 * l'app installée vers un dossier qu'on est en train de casser.
 *
 * Lecture et écriture **synchrones** : le fichier fait quelques centaines
 * d'octets et chaque geste est un aller-retour d'IPC qui attend sa réponse.
 */

const FILE_NAME = "repos.json";

function storeFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/**
 * Les attachements sur disque, ou rien.
 *
 * **Tout échec retombe sur un store vide, en silence** : fichier absent (le cas
 * normal, personne n'a encore attaché quoi que ce soit), JSON tronqué par un
 * arrêt brutal, dossier en lecture seule. Aucun de ces cas ne justifie
 * d'empêcher l'app de s'ouvrir, et le repli est toujours « pas de dossier
 * attaché », c'est-à-dire le cloud.
 */
export function readLocalRepos(): LocalRepoStore {
  try {
    return parseLocalRepoStore(JSON.parse(readFileSync(storeFile(), "utf8")));
  } catch {
    return {};
  }
}

/**
 * Retient les attachements. Rend `false` si l'écriture a échoué — l'appelant
 * répond quand même à la page, mais le choix ne survivra pas au prochain
 * lancement, et c'est une chose qu'on veut voir dans les logs plutôt que
 * découvrir au redémarrage.
 */
export function writeLocalRepos(store: LocalRepoStore): boolean {
  try {
    writeFileSync(storeFile(), serializeLocalRepoStore(store), "utf8");
    return true;
  } catch (error) {
    console.error("[local-repo] écriture impossible", error);
    return false;
  }
}
