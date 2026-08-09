"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { planSubmitShortcut } from "@/lib/keyboard/submit-shortcut";

/**
 * Branche ⌘/Ctrl + Entrée sur le bouton principal d'un formulaire.
 *
 * ```tsx
 * const submitShortcut = useSubmitShortcut();
 * <form {...submitShortcut} onSubmit={…}>…</form>
 * ```
 *
 * La règle est dans [submit-shortcut.ts] ; il ne reste ici que le DOM.
 *
 * Deux détails de câblage, tous deux voulus :
 *
 * - l'écoute est en **capture**. tiptap lie `Mod-Entrée` au saut de ligne dur
 *   sur sa propre surface : à la remontée, la ligne serait déjà insérée. React
 *   dispatche ses écouteurs de capture depuis la racine, donc avant que
 *   l'événement n'atteigne l'éditeur — c'est le seul endroit d'où on peut le
 *   lui reprendre ;
 * - on `stopPropagation()` en plus du `preventDefault()`, ce qui coupe aussi
 *   l'événement natif : sans ça, le champ de titre (qui soumet sur Entrée)
 *   soumettrait une seconde fois.
 */
export function useSubmitShortcut({
  /**
   * Comment reconnaître le bouton principal. Par défaut le premier bouton de
   * soumission du formulaire — le second, quand il y en a un (le chevron d'un
   * `SplitButton`), est un `type="button"` que ce sélecteur ne voit pas.
   *
   * À préciser quand le formulaire accueille du contenu qu'il ne choisit pas
   * (les étapes d'un wizard) : un `<button>` sans `type` y est un bouton de
   * soumission aux yeux du navigateur, et serait pris pour le CTA.
   */
  selector = 'button[type="submit"]',
}: { selector?: string } = {}) {
  const ref = useRef<HTMLFormElement>(null);

  const onKeyDownCapture = useCallback((e: KeyboardEvent) => {
    const form = ref.current;
    if (!form) return;
    const button = form.querySelector<HTMLButtonElement>(selector);
    const active = document.activeElement as HTMLElement | null;
    const plan = planSubmitShortcut(e, {
      hasEnabledSubmit: !!button && !button.disabled,
      activeIsEditor:
        !!active && active.isContentEditable && form.contains(active),
    });
    if (plan === "ignore" || !button) return;
    e.preventDefault();
    e.stopPropagation();
    if (plan === "click") {
      button.click();
      return;
    }
    // Sortir de l'éditeur remonte son markdown ; le clic attend le tour
    // suivant, quand React a rendu le formulaire avec ce texte-là.
    active?.blur();
    window.setTimeout(() => {
      if (!button.disabled) button.click();
    }, 0);
  }, [selector]);

  return { ref, onKeyDownCapture };
}
