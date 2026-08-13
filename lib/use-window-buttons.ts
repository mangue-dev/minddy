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

function pushToBridge(): void {
  getDesktopBridge()?.setWindowButtonsVisible(holds.size === 0);
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
    holds.add(reason);
    pushToBridge();
    return () => {
      holds.delete(reason);
      pushToBridge();
    };
  }, [reason, active]);
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

/* ─── Ce que la ligne de marque doit montrer ───────────────────────────── */

export interface WindowButtonsSlot {
  /** La ligne de marque garde-t-elle leur place ? (la marque passe à droite) */
  reserved: boolean;
  /** Faut-il dessiner des LEURRES, les vrais étant retirés le temps d'un modal ? */
  decoy: boolean;
}

/**
 * Ce que la barre latérale doit afficher à leur place.
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
 * Le gel compte : en plein écran il n'y a rien à réserver, et sans lui un
 * dialogue ouvert en plein écran ferait réapparaître la place.
 */
export function useWindowButtonsSlot(): WindowButtonsSlot {
  const [visible, setVisible] = useState(false);
  const modal = useAnyModalOpen();
  // Ce que valait la place juste avant que le dialogue ne s'ouvre.
  const frozen = useRef(false);
  if (!modal) frozen.current = visible;

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // L'état courant est rejoué à l'abonnement : la fenêtre peut être en plein
    // écran au chargement, et personne n'aurait alors rien à annoncer.
    return bridge.onWindowButtons(setVisible);
  }, []);

  const reserved = modal ? frozen.current : visible;
  return { reserved, decoy: reserved && !visible };
}
