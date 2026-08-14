"use client";

/**
 * Ce que l'écran courant est, quand l'URL ne suffit pas à le dire.
 *
 * « Enregistrer la vue actuelle » (palette de commandes) part de l'adresse :
 * elle porte déjà la route, la page du wiki, l'onglet des réglages, l'objectif
 * ouvert. Mais plusieurs surfaces gardent leur sélection en MÉMOIRE et
 * nettoient volontairement l'URL derrière elles — /agents efface `?run=` dès
 * qu'on choisit une conversation (sans quoi la navigation suivante vers cette
 * même conversation serait inerte : pousser l'adresse courante ne fait rien),
 * /pull-requests garde la PR cliquée hors de l'adresse, un board garde sa vue
 * active dans localStorage.
 *
 * Ces surfaces PUBLIENT donc l'adresse qui les reconstitue, via
 * `usePublishCurrentView`.
 *
 * **Rien n'est lu pendant un rendu**, et c'est le point. La publication vit
 * dans une ref, pas dans un état : sinon chaque changement de sélection — une
 * PR cliquée, une vue de board changée — repasserait par le provider et
 * rendrait à nouveau tout le shell et la page sous lui, pour une valeur que
 * personne n'affiche. La palette ne l'interroge qu'au moment où elle en a
 * besoin : `resolveHref()` au clic sur « Enregistrer », `resolveLabel()` à
 * l'ouverture du champ de nom.
 *
 * Ownership : le même verrou que `useAssistantContext` — une page qui se
 * démonte ne dépublie que si elle est encore propriétaire, sinon la navigation
 * A→B (B monte avant que le nettoyage de A ne s'exécute) effacerait la
 * publication toute fraîche de B.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { buildViewHref } from "@/lib/saved-view-href";

export interface CurrentViewSnapshot {
  /**
   * L'adresse interne qui ré-ouvre exactement cet écran, query comprise. La
   * page la fabrique elle-même — c'est elle qui sait ce qu'elle affiche.
   */
  href: string;
  /**
   * Nom proposé par défaut dans le champ de la palette (« Conversations ·
   * MIN-42 »). Optionnel : sans lui, le champ s'ouvre vide.
   */
  label?: string;
}

interface CurrentViewContextValue {
  publish: (snapshot: CurrentViewSnapshot | null, ownerId: string) => void;
  read: () => CurrentViewSnapshot | null;
}

const CurrentViewContext = createContext<CurrentViewContextValue | null>(null);

export function CurrentViewProvider({ children }: { children: ReactNode }) {
  const snapshotRef = useRef<CurrentViewSnapshot | null>(null);
  const ownerRef = useRef<string | null>(null);

  // Identité stable, pour de bon : aucun consommateur ne se re-rend jamais à
  // cause d'une publication.
  const value = useMemo<CurrentViewContextValue>(
    () => ({
      publish: (next, ownerId) => {
        if (next) {
          ownerRef.current = ownerId;
          snapshotRef.current = next;
          return;
        }
        // Seul le propriétaire courant a le droit d'effacer.
        if (ownerRef.current !== ownerId) return;
        ownerRef.current = null;
        snapshotRef.current = null;
      },
      read: () => snapshotRef.current,
    }),
    []
  );

  return (
    <CurrentViewContext.Provider value={value}>
      {children}
    </CurrentViewContext.Provider>
  );
}

/**
 * Publie l'adresse qui reconstitue l'écran, le temps que le composant est
 * monté. À appeler depuis les surfaces dont la sélection ne vit pas dans
 * l'URL ; partout ailleurs, ne rien appeler — `window.location` dit déjà tout.
 */
export function usePublishCurrentView(
  snapshot: CurrentViewSnapshot | null
): void {
  const ctx = useContext(CurrentViewContext);
  const publish = ctx?.publish;
  const ownerId = useId();
  // Sérialisé pour que l'effet ne rejoue que sur un vrai changement : l'appelant
  // reconstruit son objet à chaque rendu.
  const key = snapshot ? JSON.stringify(snapshot) : null;

  useEffect(() => {
    if (!publish) return;
    publish(key ? (JSON.parse(key) as CurrentViewSnapshot) : null, ownerId);
    return () => publish(null, ownerId);
  }, [key, ownerId, publish]);
}

export interface CurrentView {
  /** L'adresse à enregistrer, résolue au moment de l'appel. */
  resolveHref: () => string;
  /** Le nom que la page propose, résolu au moment de l'appel. */
  resolveLabel: () => string | null;
}

/**
 * Lu par la palette, jamais pendant un rendu : les deux résolveurs s'appellent
 * dans un gestionnaire d'événement (le clic sur « Enregistrer », l'ouverture du
 * menu d'actions). Lire `window.location` y est donc sûr — pas de rendu serveur
 * à désaccorder, et pas de `useSearchParams` qui imposerait une frontière
 * `<Suspense>` autour de tout le shell.
 */
export function useCurrentView(): CurrentView {
  const ctx = useContext(CurrentViewContext);
  const read = ctx?.read;

  const resolveHref = useCallback(() => {
    const published = read?.() ?? null;
    if (published) return published.href;
    if (typeof window === "undefined") return "/";
    return buildViewHref(window.location.pathname, window.location.search);
  }, [read]);

  const resolveLabel = useCallback(
    () => read?.()?.label ?? null,
    [read]
  );

  return useMemo(
    () => ({ resolveHref, resolveLabel }),
    [resolveHref, resolveLabel]
  );
}
