"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getDesktopBridge } from "./desktop/bridge";

/**
 * Les boutons macOS : qui les retire, ce qu'ils font, et ce que la barre
 * latérale doit en montrer (MIN-291).
 *
 * **Ce qu'ils font se demande au main process, ça ne se devine pas.** Deux
 * choses décident : la page, qui sait quand ils gênent — barre repliée, boîte de
 * dialogue ouverte ; et le PLEIN ÉCRAN, où macOS les emmène en haut de l'écran,
 * sous sa propre garde, sans prévenir personne. Une mise en page branchée sur la
 * demande plutôt que sur le résultat laisse un trou de 78 px dès qu'on passe en
 * plein écran. Vu à l'usage.
 */

/**
 * Les raisons de les retirer, en cours. Un `Set` et non un booléen : elles se
 * cumulent — une boîte de dialogue peut s'ouvrir alors que la barre est déjà au
 * rail — et la dernière qui se lève ne doit pas les rendre pour les autres.
 *
 * L'état vit hors de React, au niveau du module : c'est une propriété de la
 * FENÊTRE, pas d'un arbre de composants, et les demandeurs sont dispersés (la
 * barre latérale, le guetteur de modales) sans ancêtre commun qui ne soit pas le
 * layout entier.
 */
const holds = new Set<string>();

let flush = 0;

/**
 * On annonce l'état des raisons **une fois la pile retombée**, pas à chaque
 * mouvement — et c'est ce qui empêche les boutons de CLIGNOTER.
 *
 * Une raison peut être relâchée puis reprise dans le même tour de boucle : React
 * démonte les effets d'un sous-arbre avant de monter ceux du suivant, et deux
 * écrans qui demandent la même chose se relaient exactement comme ça. Poussé
 * tel quel, ça donne deux messages — « montre-les », puis « cache-les » — que le
 * main process exécute l'un après l'autre. Les boutons sont NATIFS : ils
 * apparaissent à l'instant même, hors de tout rendu de la page, et le compositeur
 * a tout le temps de les peindre entre les deux. On les voit surgir puis
 * disparaître, sans que rien à l'écran n'ait bougé.
 *
 * Un report à la fin du tour suffit : les deux mouvements s'y annulent, et il ne
 * part qu'UN message, portant l'état retombé. Ce qui change vraiment part à
 * l'image suivante — personne ne peut voir la différence.
 *
 * ⚠ On n'ajoute PAS de déduplication sur la valeur envoyée, et c'est délibéré :
 * `useWindowButtonsSlot` attend une réponse du pont pour dégeler sa mise en page
 * (cf. `settling`). Taire un message parce qu'il répète le précédent — cas réel :
 * un dialogue qui s'ouvre et se ferme alors que le rail tient déjà les boutons —
 * la laisserait attendre une réponse qui ne viendrait jamais. Un message de trop
 * ne coûte qu'un `setWindowButtonVisibility` de plus.
 */
function pushToBridge(): void {
  if (flush) return;
  flush = window.setTimeout(() => {
    flush = 0;
    getDesktopBridge()?.setWindowButtonsVisible(holds.size === 0);
  }, 0);
}

/**
 * Retire les boutons tant que `active` est vrai, sous une raison nommée.
 *
 * La raison n'est pas décorative : c'est elle qui permet à deux demandeurs de
 * coexister sans que l'un annule l'autre. Le relâchement est automatique au
 * démontage — le mode zen démonte la barre latérale, et une fenêtre sans barre
 * ni boutons n'aurait plus de fermeture visible.
 */
export function useHoldWindowButtons(reason: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    watchContradiction();
    holds.add(reason);
    pushToBridge();
    return () => {
      holds.delete(reason);
      pushToBridge();
    };
  }, [reason, active]);
}

/**
 * Le garde-fou : **la demande peut être remise à zéro sans que la page le
 * sache**, et il faut alors la réaffirmer.
 *
 * La coquille remet `wantsWindowButtons` à vrai à chaque nouveau document —
 * légitime, une page neuve n'a jamais rien demandé. Mais elle l'a longtemps fait
 * sur un événement trop large (`did-start-loading`, qui couvre aussi les
 * navigations de la SPA), et le résultat était muet : les boutons revenaient par
 * dessus une barre au rail, définitivement, parce que personne côté page n'avait
 * de raison de redemander. Rien dans le code de la page ne pouvait le laisser
 * voir — le `Set` était juste, c'est l'autre bout qui ne l'écoutait plus.
 *
 * L'événement est corrigé (desktop/src/main.ts), et **ce garde-fou reste** : il
 * ne dépend d'aucun événement en particulier, seulement de la contradiction
 * elle-même. Les boutons sont annoncés PRÉSENTS alors que la page a des raisons
 * de les retirer ? Quelque chose a repris la main ; on redemande. En plein écran
 * la coquille annonce `false`, donc ce cas-là ne se déclenche jamais à tort, et
 * il n'y a pas de boucle possible : notre demande fait publier `false`.
 *
 * Un seul abonnement pour toute la page, ouvert à la première raison posée et
 * gardé ensuite — c'est une propriété de la fenêtre, pas d'un composant.
 */
let contradictionWatcher: (() => void) | null = null;

function watchContradiction(): void {
  if (contradictionWatcher) return;
  contradictionWatcher =
    getDesktopBridge()?.onWindowButtons((visible) => {
      if (visible && holds.size > 0) pushToBridge();
    }) ?? null;
}

/* ─── Ce qui couvre l'app ──────────────────────────────────────────────── */

/**
 * Quelque chose couvre-t-il l'app — dialogue, wizard, panneau, tiroir ?
 *
 * **Deux marqueurs, parce qu'il y a deux familles**, et aucun des deux ne suffit
 * seul — les trois cas ont été relevés dans le DOM plutôt que supposés :
 *
 * - le **voile** de mangue-ui (`data-slot="…-overlay"`). Il attrape le carnet de
 *   notes, dialogue NON modal — on continue de lire derrière, donc pas
 *   d'`aria-modal` — mais qui pose bien son voile ;
 * - **`aria-modal="true"`**. Il attrape la palette ⌘K, qui vient de son propre
 *   paquet : ni `data-slot`, ni voile mangue-ui, mais bel et bien un modal.
 *
 * Ce qu'on écarte au passage, et c'est le but : `role="dialog"` tout court, que
 * Radix donne AUSSI aux popovers et aux sélecteurs. Ils ne couvrent rien, et les
 * boutons clignoteraient à chaque menu ouvert.
 */
const MODAL_SELECTOR = [
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="sheet-overlay"]',
  '[data-slot="side-panel-overlay"]',
  '[data-slot="drawer-overlay"]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
].join(", ");

/**
 * UN observateur pour tous les lecteurs. Deux composants posent la question (le
 * guetteur qui retire les boutons, la barre qui dessine les leurres) et rien ne
 * justifie deux `MutationObserver` sur le document.
 *
 * L'observation : l'arrivée du portail ne suffit pas — les attributs sont posés
 * après l'insertion — donc on écoute aussi ceux-là, mais **dans le même
 * `observe()`**. C'est le piège qui m'a coûté un tour : un second appel sur le
 * même nœud ne s'ajoute pas au premier, il REMPLACE ses options. L'examen est
 * reporté d'une image : une lecture du DOM par rafale, pas une par nœud inséré.
 */
let modalOpen = false;
let observer: MutationObserver | null = null;
let scheduled = 0;
const modalListeners = new Set<() => void>();

function readModalOpen(): void {
  const next = !!document.querySelector(MODAL_SELECTOR);
  if (next === modalOpen) return;
  modalOpen = next;
  for (const listener of modalListeners) listener();
}

function subscribeModal(listener: () => void): () => void {
  modalListeners.add(listener);
  if (!observer) {
    readModalOpen();
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        readModalOpen();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-slot", "data-state", "aria-modal"],
    });
  }
  return () => {
    modalListeners.delete(listener);
    if (modalListeners.size > 0) return;
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    observer?.disconnect();
    observer = null;
  };
}

export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    subscribeModal,
    () => modalOpen,
    // Rendu serveur : rien n'est ouvert, et il n'y a pas de DOM à interroger.
    () => false
  );
}

/* ─── Qui héberge les boutons ──────────────────────────────────────────── */

/**
 * Le point de bascule de la mise en page (`--breakpoint-desktop` de mangue-ui).
 * Sous cette largeur, l'AppShell ne rend plus les barres latérales : c'est
 * l'en-tête qui se retrouve dans le coin haut-gauche, donc sous les boutons.
 */
const DESKTOP_BREAKPOINT_PX = 1200;

/**
 * La barre latérale est-elle rendue ? (≥ 1200 px)
 *
 * Ce qui en dépend : **qui héberge les boutons macOS**. Ils vivent dans la ligne
 * de marque de la barre, mais l'AppShell la retire sous 1200 px — elle reste
 * MONTÉE (`display: none`), ce qui est le piège : sans cette question, elle
 * continuait de demander leur retrait quand son rail se repliait, et de leur
 * réserver une place que personne ne voyait. Sous 1200 px, c'est l'en-tête qui
 * les accueille.
 *
 * `false` au premier rendu, serveur comme client — il n'y a pas de `matchMedia`
 * à interroger côté serveur, et le supposer ferait diverger l'hydratation.
 */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/* ─── Ce que la ligne de marque doit montrer ───────────────────────────── */

export interface WindowButtonsSlot {
  /** La ligne de marque garde-t-elle leur place ? (la marque passe à droite) */
  reserved: boolean;
  /** Faut-il dessiner des LEURRES, les vrais étant retirés le temps d'un modal ? */
  decoy: boolean;
  /**
   * A-t-on reçu le premier état de la fenêtre ?
   *
   * Uniquement pour l'ANIMATION : la marque glisse d'un bord à l'autre quand la
   * place s'ouvre ou se referme (plein écran, rail), et il ne faut pas qu'elle
   * glisse au tout premier affichage — avant la réponse du pont, la place vaut
   * « fermée » par défaut, et animer ce rattrapage-là ferait démarrer l'app sur
   * un logo qui traverse sa barre.
   */
  ready: boolean;
}

const CLOSED: WindowButtonsSlot = { reserved: false, decoy: false, ready: false };

/**
 * Ce que la surface qui les héberge doit afficher à leur place.
 *
 * `hosts` : cette surface est-elle celle qui les accueille en ce moment ? La
 * barre latérale au-dessus de 1200 px, l'en-tête en dessous — voir
 * `useWideLayout`. Une surface qui n'héberge pas ne réserve rien.
 *
 * Le point délicat, et c'est lui qui justifie ce crochet : **une boîte de
 * dialogue ne doit pas faire sauter la barre**. Retirer les boutons est
 * nécessaire — ils sont natifs, dessinés par le système au-dessus de la vue web,
 * et aucun `z-index` ne passe devant : sans ça ils restent en travers du coin du
 * dialogue, par-dessus son voile. Mais si la mise en page suivait bêtement leur
 * disparition, la marque sauterait à gauche à chaque ouverture et reviendrait à
 * la fermeture, pour un objet qu'on ne regarde même pas.
 *
 * D'où : la place reste RÉSERVÉE — figée à ce qu'elle valait au moment où le
 * dialogue s'est ouvert — et on dessine trois pastilles à l'identique. Elles
 * passent sous le voile comme le reste de l'app, ce qui est exactement l'effet
 * qu'on cherchait au départ.
 *
 * ⚠ **Le dégel ne peut pas suivre la fermeture du dialogue : il doit suivre le
 * RETOUR des boutons.** C'est toute l'histoire du sursaut de ~50 ms qu'on voyait
 * à la fermeture. Les deux nouvelles ne viennent pas du même endroit : le
 * dialogue est parti du DOM (immédiat), les boutons reviennent du main process
 * (un aller-retour IPC plus loin). Dégeler sur le premier, c'est lire `visible`
 * alors qu'il vaut encore `false` — la place se referme, la marque saute à
 * gauche, et l'IPC arrive juste après pour tout remettre. D'où `settling` : à la
 * fermeture, on reste sur la valeur gelée jusqu'au PROCHAIN message du pont.
 * Il arrive toujours — relâcher la demande la republie (`applyWindowButtons`).
 */
export function useWindowButtonsSlot(hosts = true): WindowButtonsSlot {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const modal = useAnyModalOpen();

  // La fermeture du dialogue est-elle encore en train d'être digérée par le
  // main process ? Ajusté PENDANT le rendu (et non dans un effet) : un effet
  // s'exécute après la peinture, et la trame fautive serait déjà à l'écran.
  const [settling, setSettling] = useState(true);
  const [wasModal, setWasModal] = useState(false);
  if (wasModal !== modal) {
    setWasModal(modal);
    if (!modal) setSettling(true);
  }

  // Ce que valait la place au dernier moment STABLE — ni dialogue ouvert, ni
  // fermeture en cours de digestion.
  const frozen = useRef(false);
  useEffect(() => {
    if (!modal && !settling) frozen.current = visible;
  }, [modal, settling, visible]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // L'état courant est rejoué à l'abonnement : la fenêtre peut être en plein
    // écran au chargement, et personne n'aurait alors rien à annoncer.
    return bridge.onWindowButtons((next) => {
      setVisible(next);
      setSettling(false);
      setStarted(true);
    });
  }, []);

  /**
   * L'animation s'arme une IMAGE APRÈS la première position, jamais avec elle.
   *
   * Une transition part dès lors qu'elle est déclarée au moment où la propriété
   * change : poser la durée et la position d'arrivée dans le même rendu ferait
   * glisser la marque au démarrage de l'app, ce que ce drapeau est précisément
   * là pour éviter. Deux `requestAnimationFrame` — le premier laisse React
   * peindre la position, le second arme le mouvement pour la SUITE.
   */
  useEffect(() => {
    if (!started) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [started]);

  if (!hosts) return CLOSED;
  const reserved = modal || settling ? frozen.current : visible;
  return { reserved, decoy: reserved && !visible, ready };
}
