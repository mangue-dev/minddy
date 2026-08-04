"use client";

import { useSyncExternalStore } from "react";
import { formatModShortcut } from "@/lib/keyboard/shortcuts";

/** La plateforme ne change pas en cours de session : rien à quoi s'abonner. */
const subscribe = () => () => {};

/**
 * Le raccourci « mod + touche » écrit dans une phrase rendue — « ⌘K » sur un
 * Mac, « Ctrl+K » ailleurs.
 *
 * Pourquoi `useSyncExternalStore` et pas un simple appel : ces phrases-là (une
 * marche à suivre d'export, une aide) sont rendues AUSSI côté serveur, où
 * `navigator` n'existe pas. React prend alors la valeur serveur pour
 * l'hydratation, puis rebascule sur celle du navigateur — au lieu de crier au
 * décalage, ce que ferait une lecture directe de la plateforme au rendu.
 *
 * Le repli serveur est la forme Windows/Linux, la plus répandue : c'est celle
 * qui clignotera le moins souvent.
 */
export function useModShortcut(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => formatModShortcut(key),
    () => `Ctrl+${key}`
  );
}
