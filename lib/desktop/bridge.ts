/**
 * Le pont entre la page et l'app de bureau (MIN-291) — la surface ENTIÈRE.
 *
 * Le renderer charge du code distant : il ne doit pouvoir appeler que ce qui est
 * exposé ici, nommément, par `contextBridge`. D'où la règle que ce fichier
 * s'impose : **il se lit en trente secondes**. Treize membres, aucun qui rende
 * un objet Node, aucun qui PRENNE un chemin de fichier, aucun qui exécute quoi
 * que ce soit.
 *
 * ⚠ L'asymétrie de la dernière règle est le cœur du dossier local (MIN-359), et
 * elle est délibérée : `localRepo` **rend** un chemin, pour qu'un écran puisse
 * dire quel dossier est attaché. Aucun membre n'en **accepte** un. Un chemin ne
 * peut donc entrer dans l'app que par un panneau système, c'est-à-dire par un
 * geste humain — le code distant ne peut pas désigner `~/.ssh` en écrivant une
 * chaîne.
 *
 * L'implémentation vit dans desktop/src/preload.ts et n'a pas le droit d'en
 * exposer davantage ; ce type est ce que les deux côtés relisent.
 */

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopChannel } from "@/lib/desktop/channel";
import type { LocalRepoState } from "@/lib/desktop/local-repo";
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
  /**
   * Le dossier de CETTE machine attaché à un projet (MIN-359), **revalidé à
   * chaque appel** contre le dépôt que le projet a lié.
   *
   * Un chemin retenu ne prouve rien — le dossier a pu être déplacé, le disque
   * démonté, le dépôt re-lié ailleurs. Répondre « attaché » sur la foi du
   * fichier de réglages ferait partir un run vers un dossier qui n'existe plus,
   * et la panne n'apparaîtrait qu'au premier tour, sur la machine, sans log.
   *
   * `fullName` est le `owner/repo` du projet : c'est la page qui le connaît (le
   * main process n'a pas de session), et c'est bien elle qui décide contre quoi
   * on valide. Ce n'est pas une frontière de sécurité — le dossier vient d'un
   * geste humain dans un panneau système — mais un garde-fou d'inattention.
   */
  localRepo(input: { projectId: string; fullName: string }): Promise<LocalRepoState>;
  /**
   * Ouvre le panneau système et attache le dossier choisi à ce projet.
   *
   * **C'est le SEUL chemin par lequel un chemin de fichier entre dans l'app.**
   * Un dossier refusé (pas un dépôt, pas le bon) n'est pas rangé : l'appel rend
   * le verdict pour que l'écran le dise, et l'attachement précédent reste en
   * place. Une annulation rend l'état courant, comme si rien ne s'était passé.
   */
  chooseLocalRepo(input: {
    projectId: string;
    fullName: string;
  }): Promise<LocalRepoState>;
  /** Oublie le dossier attaché à ce projet. Rend l'état d'après. */
  forgetLocalRepo(input: { projectId: string }): Promise<LocalRepoState>;
  /** Les branches déjà présentes dans le dépôt attaché. */
  localRepoBranches?(input: { projectId: string; fullName: string }): Promise<string[]>;
  /**
   * FORCE UN TOUR SUR CETTE MACHINE (MIN-293) — **coquille de DÉV uniquement**.
   *
   * C'est le seul membre du pont qui fasse EXÉCUTER quelque chose, et il est le
   * seul à porter une condition d'existence : dans l'app empaquetée il rend
   * toujours `{ status: "refused", reason: "dev_only" }`. La raison n'est pas
   * décorative — le renderer charge du code distant, et le pont se lit en trente
   * secondes précisément parce qu'aucun de ses membres ne lance de process.
   *
   * Il existe parce que la présence, le claim et l'aiguillage appartiennent à
   * MIN-294 : sans eux aucun run n'atteint jamais la machine, et un lot qu'on ne
   * peut vérifier qu'après le suivant ne se livre pas. Ce que ce membre appelle
   * est **exactement** la fonction que la boucle de réclamation de MIN-294
   * appellera depuis le main process ; seul l'appelant changera, et ce membre-ci
   * disparaîtra avec lui.
   *
   * Il ne prend PAS de chemin, comme le reste du pont : le dossier vient de
   * l'attachement du projet, donc d'un panneau système.
   */
  startLocalRun(input: { runId: string }): Promise<LocalRunStart>;
}

/**
 * Ce que rend une demande de tour local. Le motif est fait pour un journal.
 *
 * `skipped` n'est pas un échec : le tour de ce run tourne déjà, le message part
 * dans la boucle en vol, il n'y a rien à lancer et rien à dire. Le confondre avec
 * un refus faisait surgir une alerte à chaque relance de la conversation.
 */
export type LocalRunStart =
  | { status: "started"; runId: string; logPath: string }
  | { status: "skipped"; reason: string }
  | { status: "refused"; reason: string; message: string };

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
