"use client";

// Raccourci « @ » (MIN-105) : ouvre Numo avec, en contexte, la carte de ticket
// sous le pointeur — ou la sélection multiple quand il y en a une. C'est le
// pendant clavier de l'action « Demander à Numo » de la pilule de sélection
// (voir components/bulk-issue-actions.tsx) : même `onAskNumo`, même pilule de
// contexte au-dessus du composer.
//
// L'écoute clavier est UNIQUE et vit ici, chez le board ; les cartes se
// contentent de publier « je suis sous le pointeur » via `useAskNumoTarget`.
// Un écouteur par carte (comme les raccourcis de champ) PLUS un écouteur
// global pour le cas « sélection sans survol » se marcheraient dessus : deux
// ouvertures pour une seule frappe.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import type { Issue } from "@/lib/types";

interface AskNumoContextValue {
  /** La carte sous le pointeur devient la cible du raccourci. */
  setTarget: (issue: Issue) => void;
  /** Retire la cible — sans effet si une autre carte a déjà pris la main. */
  clearTarget: (issueId: string) => void;
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
  const targetRef = useRef<Issue | null>(null);
  // Refs miroir : l'écouteur est posé une seule fois et lit toujours l'état
  // courant, sans se réabonner à chaque changement de sélection.
  const selectionRef = useRef(selectedIssues);
  selectionRef.current = selectedIssues;
  const askRef = useRef(onAskNumo);
  askRef.current = onAskNumo;

  const setTarget = useCallback((issue: Issue) => {
    targetRef.current = issue;
  }, []);
  const clearTarget = useCallback((issueId: string) => {
    if (targetRef.current?.id === issueId) targetRef.current = null;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAtSign(e)) return;
      // Jamais pendant une saisie : « @ » y est un caractère (une mention, une
      // adresse e-mail), pas un raccourci.
      if (isTypingTarget(e.target)) return;
      const selection = selectionRef.current;
      const issues =
        selection.length > 0
          ? selection
          : targetRef.current
            ? [targetRef.current]
            : [];
      if (issues.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      askRef.current(issues);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const value = useMemo(
    () => ({ setTarget, clearTarget }),
    [setTarget, clearTarget]
  );

  return (
    <AskNumoContext.Provider value={value}>{children}</AskNumoContext.Provider>
  );
}

/**
 * Déclare une carte comme cible de « @ » tant que le pointeur est dessus.
 * Rend les handlers de survol à poser sur la carte. Hors board (aucun
 * provider), c'est un no-op : le raccourci n'existe simplement pas là.
 */
export function useAskNumoTarget(issue: Issue): {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const ctx = useContext(AskNumoContext);
  const [hovered, setHovered] = useState(false);

  // `issue` en dépendance : une carte modifiée pendant qu'on la survole
  // republie sa version fraîche, donc le titre envoyé à Numo n'est jamais
  // périmé. Le nettoyage couvre aussi le démontage (filtre de vue, drag).
  useEffect(() => {
    if (!ctx || !hovered) return;
    ctx.setTarget(issue);
    return () => ctx.clearTarget(issue.id);
  }, [ctx, hovered, issue]);

  return useMemo(
    () => ({
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    }),
    []
  );
}
