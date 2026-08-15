"use client";

import { useSyncExternalStore } from "react";
import {
  formatModShiftShortcut,
  formatModShortcut,
  resolveKeyToken,
} from "@/lib/keyboard/shortcuts";

/** La plateforme ne change pas en cours de session : rien à quoi s'abonner. */
const subscribe = () => () => {};

/**
 * La touche de modification de la plateforme, seule : « ⌘ » sur un Mac,
 * « Ctrl » ailleurs. Pour les surfaces qui rendent les touches SÉPARÉMENT
 * (deux `Kbd` côte à côte, comme le cheat sheet).
 *
 * Pourquoi `useSyncExternalStore` et pas un appel direct à `resolveKeyToken` :
 * ces surfaces-là sont rendues AUSSI côté serveur, où `navigator` n'existe pas.
 * React prend alors la valeur serveur pour l'hydratation puis rebascule sur
 * celle du navigateur — au lieu de crier au décalage. Le repli serveur est la
 * forme Windows/Linux, la plus répandue : c'est celle qui clignotera le moins.
 */
export function useModKey(): string {
  return useSyncExternalStore(
    subscribe,
    () => resolveKeyToken("mod"),
    () => "Ctrl"
  );
}

/**
 * Le même raccourci écrit DANS une phrase — « ⌘K » sur un Mac, « Ctrl+K »
 * ailleurs : une marche à suivre ou un toast ont besoin d'une chaîne, pas de
 * deux touches côte à côte.
 */
export function useModShortcut(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => formatModShortcut(key),
    () => `Ctrl+${key}`
  );
}

/** Le même, avec ⇧ — « ⌘⇧L » sur un Mac, « Ctrl+Shift+L » ailleurs. */
export function useModShiftShortcut(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => formatModShiftShortcut(key),
    () => `Ctrl+Shift+${key}`
  );
}
