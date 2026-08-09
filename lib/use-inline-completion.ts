"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEBOUNCE_MS,
  advanceSuggestion,
  isDismissed,
  shouldSuggest,
  windowPrefix,
  type CompletionField,
  type Dismissal,
} from "@/lib/inline-completion";

/**
 * Le texte fantôme d'un champ : on lui donne ce qui précède le caret à chaque
 * frappe, il rend ce qu'il faut afficher en gris.
 *
 * La surface (une textarea, l'éditeur tiptap) ne sait rien du réseau ; le hook
 * ne sait rien du DOM. Entre les deux il n'y a que `setPrefix(prefix | null)` —
 * `null` voulant dire « le caret n'est plus à un endroit où compléter » (au
 * milieu du texte, sur une sélection, hors du champ).
 *
 * Ce que le hook garantit, et qui n'est pas gratuit :
 * - **un seul appel en vol**, le précédent est avorté ;
 * - **rien ne s'affiche en retard** : une réponse dont le préfixe n'est plus
 *   celui du champ est jetée, jamais posée sous un texte qui a changé ;
 * - **le même préfixe n'est demandé qu'une fois** (cache de session, réponses
 *   vides comprises — un « rien à dire » est une réponse, et la redemander à
 *   chaque aller-retour du caret coûterait autant qu'une vraie).
 */
export function useInlineCompletion({
  projectId,
  field,
  enabled,
  getContext,
}: {
  projectId: string;
  field: CompletionField;
  /** Coupe tout : la surface est fermée, occupée (dictée, envoi), ou absente. */
  enabled: boolean;
  /** Le brouillon autour du champ, lu au moment de l'appel — jamais capturé. */
  getContext?: () => {
    title?: string;
    categories?: string[];
    objective?: string;
  };
}) {
  const [suggestion, setSuggestion] = useState("");

  const suggestionRef = useRef("");
  const prefixRef = useRef<string | null>(null);
  const dismissedRef = useRef<Dismissal>(null);
  const cacheRef = useRef(new Map<string, string>());
  // Le serveur a dit « ne redemande pas » (drapeau baissé, budget épuisé, pas de
  // clé) : on se tait pour la session plutôt que de le rappeler à chaque touche.
  const offRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef(getContext);
  contextRef.current = getContext;

  const show = useCallback((next: string) => {
    suggestionRef.current = next;
    setSuggestion(next);
  }, []);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const request = useCallback(
    async (prefix: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const ctx = contextRef.current?.() ?? {};
      try {
        const res = await fetch(`/api/projects/${projectId}/complete-issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, prefix: windowPrefix(prefix), ...ctx }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          completion?: string;
          disabled?: boolean;
        };
        if (data.disabled) {
          offRef.current = true;
          return;
        }
        const completion = typeof data.completion === "string" ? data.completion : "";
        cacheRef.current.set(prefix, completion);
        // La réponse d'un texte qu'on n'écrit plus n'a rien à dire du texte
        // qu'on écrit : elle est en cache, elle n'est pas à l'écran.
        if (prefixRef.current !== prefix) return;
        if (isDismissed(dismissedRef.current, prefix)) return;
        if (completion) show(completion);
      } catch {
        // Avortement ou panne réseau : pas de fantôme, pas de bruit. La frappe
        // suivante redemandera.
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [projectId, field, show]
  );

  /**
   * À appeler à chaque frappe ET à chaque mouvement du caret. `null` = ici on ne
   * complète pas.
   */
  const setPrefix = useCallback(
    (next: string | null) => {
      if (!enabled || offRef.current || next === null) {
        cancelPending();
        prefixRef.current = next;
        if (suggestionRef.current) show("");
        return;
      }

      const previous = prefixRef.current;
      prefixRef.current = next;

      // Taper à travers le fantôme : on le rogne, sans réseau. C'est le chemin
      // le plus fréquent quand la suggestion est bonne, et il doit être gratuit.
      if (suggestionRef.current && previous !== null) {
        const advanced = advanceSuggestion(suggestionRef.current, previous, next);
        if (advanced) {
          show(advanced);
          return;
        }
        show("");
        // `advanced === ""` : le fantôme a été tapé en entier, on en redemande
        // un neuf pour la suite. `null` : la frappe s'en écarte, idem.
      }

      cancelPending();
      if (isDismissed(dismissedRef.current, next)) return;
      dismissedRef.current = null;
      if (!shouldSuggest(field, next)) return;

      const cached = cacheRef.current.get(next);
      if (cached !== undefined) {
        if (cached) show(cached);
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void request(next);
      }, DEBOUNCE_MS[field]);
    },
    [enabled, field, cancelPending, request, show]
  );

  /** Tab : rend le texte à insérer, et se retire. */
  const accept = useCallback(() => {
    const text = suggestionRef.current;
    if (!text) return "";
    show("");
    // Le préfixe grandit d'autant : sans ça, la frappe suivante croirait que
    // l'humain vient d'écrire toute la suggestion à la main et la comparerait
    // au mauvais texte.
    if (prefixRef.current !== null) prefixRef.current += text;
    return text;
  }, [show]);

  /** Échap : le gris s'en va, et ne revient pas tout de suite. */
  const dismiss = useCallback(() => {
    cancelPending();
    dismissedRef.current = prefixRef.current;
    if (suggestionRef.current) show("");
  }, [cancelPending, show]);

  /** Le formulaire repart de zéro (création enchaînée, brouillon repris). */
  const reset = useCallback(() => {
    cancelPending();
    prefixRef.current = null;
    dismissedRef.current = null;
    show("");
  }, [cancelPending, show]);

  // Rien ne survit au démontage : un timer qui part après coup poserait un
  // `setState` sur un composant mort, et une requête en vol paierait un appel
  // pour un formulaire qui n'est plus là.
  useEffect(() => cancelPending, [cancelPending]);
  useEffect(() => {
    if (!enabled) {
      cancelPending();
      if (suggestionRef.current) show("");
    }
  }, [enabled, cancelPending, show]);

  return { suggestion, setPrefix, accept, dismiss, reset };
}
