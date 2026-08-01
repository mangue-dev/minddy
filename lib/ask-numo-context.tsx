"use client";

// Raccourci « @ » (MIN-105) : ouvre Numo avec, en contexte, la carte de ticket
// sous le pointeur — ou la sélection multiple quand il y en a une. C'est le
// pendant clavier de l'action « Demander à Numo » de la pilule de sélection
// (voir components/bulk-issue-actions.tsx) : même `onAskNumo`, même pilule de
// contexte au-dessus du composer.
//
// L'écoute clavier est UNIQUE et vit ici, chez le board ; les cartes se
// contentent de s'inscrire via `useAskNumoTarget`. Un écouteur par carte
// (comme les raccourcis de champ) PLUS un écouteur global pour le cas
// « sélection sans survol » se marcheraient dessus : deux ouvertures pour une
// seule frappe.
//
// Quelle carte est sous le pointeur se lit dans le DOM AU MOMENT de la frappe
// (`innermostHovered`), jamais dans un état mémorisé au survol : celui-ci
// retarde d'un effet passif sur le pointeur et désigne encore la carte
// précédente (MIN-158).

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

interface AskNumoContextValue {
  /** Inscrit une carte comme cible possible ; rend sa désinscription. */
  register: (el: Element, getIssue: () => Issue) => () => void;
}

const AskNumoContext = createContext<AskNumoContextValue | null>(null);

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

/**
 * Monté par un board : arbitre ce que « @ » envoie à Numo. La sélection prime
 * sur le survol — quand la pilule est là, c'est elle le mode courant.
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
  // Les cartes montées, chacune sachant rendre sa version fraîche de l'issue
  // (une carte modifiée sous le pointeur n'envoie donc jamais un titre périmé).
  const targetsRef = useRef(new Map<Element, () => Issue>());
  // Refs miroir : l'écouteur est posé une seule fois et lit toujours l'état
  // courant, sans se réabonner à chaque changement de sélection.
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const askRef = useRef(onAskNumo);
  askRef.current = onAskNumo;

  const register = useCallback((el: Element, getIssue: () => Issue) => {
    const targets = targetsRef.current;
    targets.set(el, getIssue);
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
      const selection = selectionRef.current;
      const hovered = innermostHovered(targetsRef.current)?.();
      const issues =
        selection.length > 0 ? selection : hovered ? [hovered] : [];
      if (issues.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      askRef.current(issues);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <AskNumoContext.Provider value={value}>{children}</AskNumoContext.Provider>
  );
}

/**
 * Déclare une carte comme cible possible de « @ ». Rend un callback ref à
 * poser sur la carte (fusionné avec ses autres refs, sans rien renvoyer depuis
 * la fusion : c'est le rappel avec `null` qui désinscrit au démontage — filtre
 * de vue, drag). Hors board (aucun provider), c'est un no-op : le raccourci
 * n'existe simplement pas là.
 */
export function useAskNumoTarget(issue: Issue): (el: Element | null) => void {
  const register = useContext(AskNumoContext)?.register;
  const issueRef = useRef(issue);
  issueRef.current = issue;
  const unregister = useRef<(() => void) | null>(null);

  return useCallback(
    (el: Element | null) => {
      unregister.current?.();
      unregister.current =
        el && register ? register(el, () => issueRef.current) : null;
    },
    [register]
  );
}
