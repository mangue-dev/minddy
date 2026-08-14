/**
 * Le pont entre la page et l'app de bureau (MIN-291) — la surface ENTIÈRE.
 *
 * Le renderer charge du code distant : il ne doit pouvoir appeler que ce qui est
 * exposé ici, nommément, par `contextBridge`. D'où la règle que ce fichier
 * s'impose : **il se lit en trente secondes**. Dix membres, aucun qui rende
 * un objet Node, aucun qui prenne un chemin de fichier, aucun qui exécute quoi
 * que ce soit.
 *
 * L'implémentation vit dans desktop/src/preload.ts et n'a pas le droit d'en
 * exposer davantage ; ce type est ce que les deux côtés relisent.
 */

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopChannel } from "@/lib/desktop/channel";
import type { DesktopUpdateStatus } from "@/lib/desktop/update-status";

export interface DesktopBridge {
  /** La version de la coquille (`app.getVersion()`), pour l'afficher. */
  readonly version: string;
  /**
   * Ouvre une URL dans le navigateur du système. C'est par là que passe le tour
   * d'authentification, et c'est le main process qui refuse tout ce qui n'est
   * pas `http(s)` — le renderer ne décide pas de ce qu'on donne à `open`.
   */
  openExternal(url: string): void;
  /**
   * Le retour du tour d'authentification (`minddy://auth?…`). Rend son
   * désabonnement. Le lien reçu AVANT l'abonnement est rejoué à l'abonnement :
   * un clic sur le lien du mail peut lancer l'app, et le main process a alors
   * son deep link bien avant que React ne soit monté.
   */
  onAuthLink(handler: (link: DesktopAuthLink) => void): () => void;
  /** Le compteur du dock. `0` retire la pastille. */
  setBadgeCount(count: number): void;
  /**
   * DEMANDE que les boutons macOS (fermer / réduire / plein écran) soient
   * montrés ou cachés.
   *
   * Ils vivent DANS la barre latérale, à la place de la marque — pas dans une
   * bande à eux, qui pousserait toute la colonne vers le bas et trahirait la
   * couture. Repliée au rail, ses 56 px ne les tiennent plus : on les retire,
   * plutôt que de les laisser déborder sur la navigation. La fenêtre reste
   * fermable au clavier (⌘W, ⌘Q) et par le menu.
   *
   * C'est une DEMANDE et pas un ordre, et le main process la refuse dans un cas
   * qui compte : **en plein écran il ne cache jamais rien**, sans quoi on
   * retirerait le seul moyen d'en sortir à la souris. Ce que les boutons font
   * vraiment revient par `onWindowButtons`.
   */
  setWindowButtonsVisible(visible: boolean): void;
  /**
   * Ce que les boutons font VRAIMENT — la seule chose sur laquelle la mise en
   * page ait le droit de s'appuyer. Rend son désabonnement, et rejoue l'état
   * courant à l'abonnement.
   *
   * Deux entrées, une seule connue de la page : la barre latérale demande, et
   * le plein écran décide sans elle. Une mise en page qui suit la demande
   * plutôt que le résultat laisse un trou à la place des boutons dès qu'on
   * passe en plein écran — c'était le cas.
   */
  onWindowButtons(handler: (visible: boolean) => void): () => void;
  /**
   * Remet la fenêtre au premier plan. Le clic sur une notification native est
   * livré au RENDERER (c'est lui qui l'a émise) et ne réveille rien tout seul :
   * sans ce membre, cliquer sur la bannière naviguerait dans une fenêtre restée
   * derrière le navigateur.
   */
  focus(): void;
  /**
   * Change de CANAL — la version de minddy que la fenêtre montre (MIN-352).
   *
   * En écriture seulement, et c'est voulu : la page n'a pas à demander dans quel
   * canal elle est, elle le lit sur sa propre origine
   * (`desktopChannelForOrigin`, lib/desktop/channel.ts). Un canal recopié ici
   * serait un second état à tenir synchrone avec l'URL réellement chargée.
   *
   * L'appel ne rend pas la main : le main process retient le choix, puis
   * recharge la fenêtre sur l'autre origine. Ce document-ci n'existe plus après.
   */
  setChannel(channel: DesktopChannel): void;
  /**
   * Où en est la mise à jour de la coquille (MIN-353). Rend son désabonnement,
   * et rejoue l'état courant à l'abonnement — sans quoi une page montée après le
   * téléchargement (c'est-à-dire toutes, une fois la fenêtre rechargée) ne
   * saurait jamais qu'une version l'attend.
   *
   * Les valeurs et leurs règles sont dans `lib/desktop/update-status.ts`.
   */
  onUpdateStatus(handler: (status: DesktopUpdateStatus) => void): () => void;
  /**
   * DEMANDE l'installation de la mise à jour téléchargée.
   *
   * Ce n'est pas un ordre, et la nuance est tout l'intérêt du membre : le main
   * process rouvre la boîte native — « Install and Relaunch » / « Later » — au
   * lieu de relancer l'app sous les doigts de qui vient de cliquer. La page
   * annonce et rappelle ; c'est le système qui demande le dernier oui, et lui
   * seul sait si le fichier est encore là.
   *
   * Sans effet quand rien n'est prêt.
   */
  installUpdate(): void;
}

declare global {
  interface Window {
    minddy?: DesktopBridge;
  }
}

/** Le pont, ou `null` dans un navigateur (et pendant le rendu serveur). */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.minddy ?? null;
}

/**
 * Tourne-t-on dans l'app de bureau ?
 *
 * La présence du pont, jamais l'user agent : le suffixe `minddy-desktop/…` est
 * là pour les logs du serveur, et un user agent se falsifie depuis la page.
 */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}
