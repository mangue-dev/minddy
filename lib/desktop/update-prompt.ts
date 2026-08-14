/**
 * La proposition d'installer, une fois la mise à jour TÉLÉCHARGÉE (MIN-353).
 *
 * ## Ce qui change, et ce qui ne change pas
 *
 * Le rythme reste celui de `updater.ts` : on télécharge tout seul, en silence,
 * et **rien ne s'installe sans un oui**. Ce que ce module ajoute, c'est le
 * moment où on demande. Jusqu'ici l'installation attendait le prochain ⌘Q sans
 * jamais le dire — une app de bureau qui ne quitte quasiment jamais (⌘W la
 * cache, elle ne la ferme pas) restait donc sur sa version des semaines, avec
 * la neuve déjà sur le disque.
 *
 * ## Pourquoi « Install and Relaunch » et pas « Restart Now »
 *
 * Parce que la phrase doit dire les DEUX moitiés de ce qui va se passer. Un
 * bouton qui ne promet qu'un redémarrage laisse croire qu'on retrouvera la même
 * version ; un bouton qui ne promet qu'une installation laisse croire qu'on peut
 * continuer à travailler pendant. C'est la formule qu'emploient les apps qui
 * font ça bien, et ce n'est pas un hasard.
 *
 * `Later` n'annule rien : la mise à jour est là, `autoInstallOnAppQuit` la
 * posera au prochain ⌘Q. C'est pour ça qu'il est le bouton d'ÉCHAPPEMENT
 * (Échap, feu rouge) — l'issue par défaut d'un dialogue qu'on renvoie sans le
 * lire ne doit jamais être celle qui interrompt le travail.
 *
 * Module PUR : `desktop/src/updater.ts` ne fait qu'ouvrir la boîte et lire la
 * réponse.
 */

/** Ce que `dialog.showMessageBox` attend, réduit à ce qu'on décide ici. */
export interface UpdatePromptCopy {
  type: "info";
  message: string;
  detail: string;
  buttons: string[];
  /** Le bouton mis en avant, celui que ⏎ déclenche. */
  defaultId: number;
  /** Celui d'Échap et du feu rouge — jamais l'installation. */
  cancelId: number;
}

export function updatePromptCopy(version: string): UpdatePromptCopy {
  return {
    type: "info",
    message: `minddy ${version} is ready to install.`,
    detail:
      "minddy will close and reopen — it takes a few seconds. If you’re in the middle of something, install it later and it will be applied the next time you quit minddy.",
    buttons: ["Install and Relaunch", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
}

/**
 * Ce que la réponse veut dire.
 *
 * **Tout ce qui n'est pas explicitement le premier bouton est un `later`.**
 * `showMessageBox` rend `cancelId` quand la boîte est fermée sans choix, mais
 * elle peut aussi rendre `-1` selon la façon dont elle est renvoyée : on ne
 * teste donc pas « est-ce que c'est un refus », on teste « est-ce que c'est un
 * oui ». Une mise à jour qui s'installe sur un dialogue mal fermé, c'est
 * exactement ce que le bouton par défaut sert à éviter.
 */
export function updatePromptChoice(response: number): "install" | "later" {
  return response === 0 ? "install" : "later";
}
