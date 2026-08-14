/**
 * Où en est la mise à jour de la coquille, vu de la PAGE (MIN-353).
 *
 * ## Pourquoi la page a besoin de le savoir
 *
 * La boîte native est un instant : elle s'ouvre une fois, à la fin du
 * téléchargement, et qui répond « plus tard » n'a plus rien devant les yeux.
 * L'état, lui, dure — la version neuve reste sur le disque jusqu'au prochain ⌘Q.
 * D'où cette seconde surface, dans la barre latérale : elle ne demande rien,
 * elle CONSTATE, et elle se retrouve quand on la cherche.
 *
 * ## Un état, pas des événements
 *
 * electron-updater parle en événements (`update-available`, `update-downloaded`,
 * `error`), et un abonné arrivé après coup ne les entend jamais. Or le renderer
 * arrive TOUJOURS après coup : la fenêtre se recharge, on change de canal, la
 * page se remonte. Le main process tient donc l'état, la page le lit — et le
 * rejeu à l'abonnement, comme pour les boutons macOS, est ce qui fait la
 * différence entre « il n'y a pas de mise à jour » et « je n'étais pas là quand
 * on l'a dit ».
 *
 * Module PUR : `desktop/src/updater.ts` réduit les événements ici,
 * `components/app-sidebar.tsx` affiche le résultat.
 */

export type DesktopUpdateStatus =
  /** Rien à signaler — le cas de presque toujours, et celui du navigateur. */
  | { state: "idle" }
  /** Une version neuve est en train de descendre. Rien à faire, rien à cliquer. */
  | { state: "downloading"; version: string }
  /** Elle est sur le disque. C'est le seul état où un geste est possible. */
  | { state: "ready"; version: string };

export const IDLE_UPDATE_STATUS: DesktopUpdateStatus = { state: "idle" };

/** Ce que la coquille apprend d'electron-updater, réduit à ce qui compte. */
export type DesktopUpdateEvent =
  | { kind: "available"; version: string }
  | { kind: "downloaded"; version: string }
  | { kind: "error" };

/**
 * L'état suivant.
 *
 * **Deux règles, et chacune répare un aller-retour qu'on aurait vu à l'écran.**
 *
 * 1. **Une version déjà prête ne redevient pas « en cours ».** La vérification
 *    tourne toutes les six heures et réannonce ce qu'elle trouve, téléchargé ou
 *    non : sans cette garde, une mise à jour posée sur le disque le lundi
 *    repassait en « téléchargement… » tous les six heures, et n'en ressortait
 *    jamais — le second `update-downloaded`, lui, n'est pas garanti.
 * 2. **Une erreur n'efface pas ce qui est prêt.** Le fichier est là ; un Wi-Fi
 *    d'hôtel qui fait échouer la vérification suivante ne le retire pas du
 *    disque. Retirer la ligne à ce moment-là, c'est effacer la seule chose qui
 *    permettait encore d'installer.
 *
 * Une erreur PENDANT le téléchargement, en revanche, ramène au silence : il n'y
 * a rien sur le disque et rien à annoncer.
 */
export function reduceUpdateStatus(
  current: DesktopUpdateStatus,
  event: DesktopUpdateEvent
): DesktopUpdateStatus {
  if (event.kind === "downloaded") {
    return { state: "ready", version: event.version };
  }
  if (event.kind === "available") {
    if (current.state === "ready" && current.version === event.version) {
      return current;
    }
    return { state: "downloading", version: event.version };
  }
  return current.state === "ready" ? current : IDLE_UPDATE_STATUS;
}
