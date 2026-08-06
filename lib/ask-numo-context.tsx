"use client";

// Raccourci « @ » (MIN-105) : ouvre Numo avec, en contexte, l'élément sous le
// pointeur — une carte de ticket, une ligne de triage, une ligne de retour — ou
// la sélection multiple quand il y en a une. C'est le pendant clavier de
// l'action « Demander à Numo » de la pilule de sélection (voir
// components/bulk-issue-actions.tsx) : même `onAskNumo`, même pilule de
// contexte au-dessus du composer.
//
// L'écoute clavier est UNIQUE et vit ici, chez la surface ; les éléments se
// contentent de s'inscrire. Un écouteur par carte (comme les raccourcis de
// champ) PLUS un écouteur global pour le cas « sélection sans survol » se
// marcheraient dessus : deux ouvertures pour une seule frappe.
//
// Quel élément est sous le pointeur se lit dans le DOM AU MOMENT de la frappe
// (`innermostHovered`), jamais dans un état mémorisé au survol : celui-ci
// retarde d'un effet passif sur le pointeur et désigne encore l'élément
// précédent (MIN-158).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { innermostHovered } from "@/lib/keyboard/hover-keys";
import type { Issue } from "@/lib/types";

/**
 * « @ » ne vit pas sur la même touche selon la disposition : Maj+2 en QWERTY
 * US, touche nue sur un clavier Apple français, AltGr+0 sous Windows FR — et
 * AltGr lève à la fois `ctrlKey` et `altKey`. On lit donc le CARACTÈRE produit
 * plutôt que la touche physique, et on n'écarte que les vraies combinaisons
 * ⌘/Ctrl. `eventKey` protège des keydown synthétiques sans `key`.
 */
function isAtSign(e: KeyboardEvent): boolean {
  if (eventKey(e) !== "@") return false;
  if (e.metaKey) return false;
  return !(e.ctrlKey && !e.altKey);
}

/** Rien de sélectionné — une constante plutôt qu'un `[]` neuf à chaque rendu. */
const NOTHING: readonly never[] = [];

/**
 * Fabrique le couple provider + inscription pour UN type de chose dont on peut
 * parler à Numo. Provider et hook naissent ensemble parce qu'ils partagent le
 * même contexte React ; l'appeler deux fois donne deux registres étanches.
 *
 * Deux surfaces montées en même temps ne se gênent pas, même si chacune pose
 * son écouteur : celle qui n'a ni sélection ni élément survolé sort sans rien
 * consommer (pas de `preventDefault`), et le survol ne peut désigner qu'un
 * registre à la fois.
 */
function createAskNumo<T>() {
  const Registry = createContext<{
    register: (el: Element, get: () => T) => () => void;
  } | null>(null);

  function AskProvider({
    selection,
    onAsk,
    children,
  }: {
    /** Ce qui est sélectionné, et qui prime sur le survol. Vide si la surface
     *  n'a pas de sélection multiple. */
    selection: readonly T[];
    onAsk: (targets: T[]) => void;
    children: ReactNode;
  }) {
    // Les éléments montés, chacun sachant rendre sa version fraîche de la chose
    // (une ligne modifiée sous le pointeur n'envoie donc jamais un titre périmé).
    const targetsRef = useRef(new Map<Element, () => T>());
    // Refs miroir : l'écouteur est posé une seule fois et lit toujours l'état
    // courant, sans se réabonner à chaque changement de sélection.
    const selectionRef = useRef(selection);
    selectionRef.current = selection;
    const askRef = useRef(onAsk);
    askRef.current = onAsk;

    const register = useCallback((el: Element, get: () => T) => {
      const targets = targetsRef.current;
      targets.set(el, get);
      return () => {
        targets.delete(el);
      };
    }, []);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!isAtSign(e)) return;
        // Jamais pendant une saisie : « @ » y est un caractère (une mention, une
        // adresse e-mail), pas un raccourci.
        if (isTypingTarget(e.target)) return;
        const selected = selectionRef.current;
        const hovered = innermostHovered(targetsRef.current)?.();
        const targets =
          selected.length > 0 ? [...selected] : hovered ? [hovered] : [];
        if (targets.length === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        askRef.current(targets);
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const value = useMemo(() => ({ register }), [register]);

    return <Registry.Provider value={value}>{children}</Registry.Provider>;
  }

  /**
   * Déclare un élément comme cible possible de « @ ». Rend un callback ref à
   * poser dessus (fusionné avec ses autres refs, sans rien renvoyer depuis la
   * fusion : c'est le rappel avec `null` qui désinscrit au démontage — filtre
   * de vue, drag). Hors surface (aucun provider), c'est un no-op : le raccourci
   * n'existe simplement pas là.
   */
  function useAskTarget(target: T): (el: Element | null) => void {
    const register = useContext(Registry)?.register;
    const targetRef = useRef(target);
    targetRef.current = target;
    const unregister = useRef<(() => void) | null>(null);

    return useCallback(
      (el: Element | null) => {
        unregister.current?.();
        unregister.current =
          el && register ? register(el, () => targetRef.current) : null;
      },
      [register]
    );
  }

  return { AskProvider, useAskTarget };
}

// ── Tickets : board de projet, board global, colonne de triage ───────────────

const issueAsk = createAskNumo<Issue>();

/**
 * Monté par un board (ou la colonne de triage) : arbitre ce que « @ » envoie à
 * Numo. La sélection prime sur le survol — quand la pilule est là, c'est elle
 * le mode courant.
 */
export function AskNumoProvider({
  selectedIssues,
  onAskNumo,
  children,
}: {
  selectedIssues: Issue[];
  onAskNumo: (issues: Issue[]) => void;
  children: ReactNode;
}) {
  return (
    <issueAsk.AskProvider selection={selectedIssues} onAsk={onAskNumo}>
      {children}
    </issueAsk.AskProvider>
  );
}

/** Déclare une carte de ticket comme cible possible de « @ ». */
export const useAskNumoTarget = issueAsk.useAskTarget;

// ── Retours : colonne de l'onglet équipe ─────────────────────────────────────

/**
 * Le minimum qu'une ligne de retour doit savoir dire d'elle-même pour que Numo
 * la reçoive en contexte. Volontairement structurel plutôt que
 * `TeamFeedbackListItem` : ce fichier n'a pas à connaître la forme d'un retour.
 */
export interface AskNumoFeedback {
  id: string;
  /** Le titre canonique — celui que porte la pilule de contexte du composer. */
  title: string;
}

const feedbackAsk = createAskNumo<AskNumoFeedback>();

/**
 * Monté par l'onglet équipe des retours : « @ » au survol d'une ligne ouvre
 * Numo avec CE retour en contexte, sans avoir à l'ouvrir d'abord.
 *
 * Pas de sélection ici — les retours se tranchent un par un — donc le survol
 * décide seul, et le rappel reçoit un retour et non une liste.
 */
export function AskNumoFeedbackProvider({
  onAskNumo,
  children,
}: {
  onAskNumo: (post: AskNumoFeedback) => void;
  children: ReactNode;
}) {
  const onAsk = useCallback(
    (targets: AskNumoFeedback[]) => onAskNumo(targets[0]),
    [onAskNumo]
  );
  return (
    <feedbackAsk.AskProvider selection={NOTHING} onAsk={onAsk}>
      {children}
    </feedbackAsk.AskProvider>
  );
}

/** Déclare une ligne de retour comme cible possible de « @ ». */
export const useAskNumoFeedbackTarget = feedbackAsk.useAskTarget;
