"use client";

// Raccourcis clavier qui agissent sur « ce qu'il y a sous le pointeur » : les
// pickers de champ d'une carte de ticket (S/P/E/A/L/D/O), ⇧A/⇧P sur une tâche
// du carnet, « @ » sur une carte. Tous suivent la même règle — **la cible est
// décidée au moment de la frappe**, en demandant au DOM qui est `:hover`.
//
// Cette règle existe parce que l'implémentation évidente est fausse (MIN-158).
// Garder le survol dans un state React et abonner l'écouteur depuis un
// `useEffect` glisse un **effet passif** entre le déplacement du pointeur et le
// déplacement de l'écouteur : React flushe ces effets après la peinture, pas à
// la fin de l'événement souris. On passe de la carte A à la carte B, on tape
// dans cette fenêtre, et c'est A qui écoute encore — et comme ces handlers
// appellent `stopImmediatePropagation()`, B ne verrait pas la touche même déjà
// abonnée. La fenêtre est invisible sur une page au repos et large sur une page
// chargée : c'est exactement à quoi ressemble « de temps en temps, ça part sur
// la carte d'avant ».
//
// `:hover` n'a pas ce décalage : le navigateur le met à jour pendant le
// hit-test, dans le même souffle que `mouseenter`. Il se répare aussi tout
// seul — un `mouseleave` perdu, un élément démonté sous le curseur, un calque
// qui recouvre la carte — là où un drapeau mémorisé resterait périmé.

import { useCallback, useRef } from "react";

/**
 * La valeur inscrite pour le plus INTÉRIEUR des éléments survolés, ou
 * `undefined` si aucun inscrit n'est sous le pointeur.
 *
 * `:hover` vaut pour toute l'ascendance : une tâche imbriquée dans une tâche,
 * une carte dans un panneau, sont toutes deux survolées. Prendre la plus
 * intérieure est la seule lecture qui corresponde à ce que l'utilisateur vise.
 * Le survol formant un seul chemin depuis la racine, deux inscrits survolés
 * sont toujours l'un dans l'autre : `contains` tranche à tous les coups.
 *
 * On interroge les inscrits un par un plutôt que le document entier
 * (`querySelectorAll(":hover")`) : le coût suit le nombre de cartes montées, pas
 * la taille du DOM — et ceci tourne à CHAQUE frappe, y compris pendant qu'on
 * écrit une description.
 */
export function innermostHovered<T>(
  registry: Map<Element, T>,
  isHovered: (el: Element) => boolean = (el) => el.matches(":hover")
): T | undefined {
  let innermost: Element | null = null;
  for (const el of registry.keys()) {
    if (!isHovered(el)) continue;
    if (!innermost || innermost.contains(el)) innermost = el;
  }
  return innermost ? registry.get(innermost) : undefined;
}

type HoverKeyHandler = (e: KeyboardEvent) => void;

const handlers = new Map<Element, HoverKeyHandler>();

function dispatch(e: KeyboardEvent) {
  innermostHovered(handlers)?.(e);
}

/**
 * Inscrit `handler` comme handler de survol de `el`. Rend son désabonnement.
 *
 * Un seul écouteur `keydown` pour toute l'application, monté au premier inscrit
 * et retiré au dernier : cent cartes ne font pas cent écouteurs, et il n'y a
 * plus d'ordre d'abonnement entre cartes dont dépendrait qui gagne.
 */
export function registerHoverKeys(
  el: Element,
  handler: HoverKeyHandler
): () => void {
  if (handlers.size === 0) window.addEventListener("keydown", dispatch, true);
  handlers.set(el, handler);
  return () => {
    if (!handlers.delete(el)) return;
    if (handlers.size === 0)
      window.removeEventListener("keydown", dispatch, true);
  };
}

/**
 * Exécute `handler` à chaque frappe pendant que le pointeur est sur l'élément
 * porteur du ref rendu. Rendre un **callback ref** : le poser sur l'élément (le
 * fusionner avec les autres refs qu'il porte déjà, sans rien renvoyer depuis la
 * fusion pour que React rappelle bien avec `null` au démontage).
 *
 * `handler` et `enabled` se lisent par ref : l'abonnement se fait une fois, au
 * montage. Rien dedans ne dépend du survol, donc rien ne peut retarder sur le
 * pointeur.
 */
export function useHoverKeys(
  handler: HoverKeyHandler,
  enabled = true
): (el: Element | null) => void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const unsubscribe = useRef<(() => void) | null>(null);

  return useCallback((el: Element | null) => {
    unsubscribe.current?.();
    unsubscribe.current = el
      ? registerHoverKeys(el, (e) => {
          if (enabledRef.current) handlerRef.current(e);
        })
      : null;
  }, []);
}
