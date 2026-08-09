import { isSendShortcut } from "@/lib/keyboard/send-shortcut";

/**
 * ⌘/Ctrl + Entrée dans un FORMULAIRE : ce que le raccourci doit faire, décidé
 * hors de tout DOM pour rester lisible et testable.
 *
 * Le geste n'appelle pas la fonction de soumission : il **clique le bouton
 * principal**. C'est ce qui le tient aligné sur ce que l'écran montre — un
 * bouton grisé (titre vide, envoi en cours, pièce jointe encore en vol) ne
 * s'active pas plus au clavier qu'à la souris, sans qu'aucune de ces conditions
 * n'ait à être recopiée ici.
 *
 * `blur-then-click` est la subtilité qui compte. Nos éditeurs de description
 * (tiptap) ne remontent leur markdown qu'au BLUR : cliquer le bouton pendant
 * que le caret est encore dedans enverrait la description telle qu'elle était
 * au dernier blur — c'est-à-dire, sur un ticket qu'on vient d'écrire, vide. On
 * sort donc du champ d'abord, et on clique au tour d'après.
 */
export type SubmitShortcutPlan = "ignore" | "click" | "blur-then-click";

export function planSubmitShortcut(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; defaultPrevented?: boolean },
  state: {
    /** Le formulaire porte un `button[type=submit]` actionnable. */
    hasEnabledSubmit: boolean;
    /** Le focus est dans une surface contenteditable de ce formulaire. */
    activeIsEditor: boolean;
  }
): SubmitShortcutPlan {
  if (e.defaultPrevented) return "ignore";
  if (!isSendShortcut(e)) return "ignore";
  // Pas de bouton, ou un bouton grisé : on ne fait RIEN, et surtout on ne
  // confisque pas la frappe — ⌘Entrée reste le saut de ligne dur de tiptap là
  // où il n'y a rien à créer.
  if (!state.hasEnabledSubmit) return "ignore";
  return state.activeIsEditor ? "blur-then-click" : "click";
}
