/**
 * LA MÉCANIQUE du texte fantôme, côté navigateur — quand demander, comment
 * suivre la frappe sans redemander, quand se taire.
 *
 * Tout ce qui décide vit ici, en fonctions pures, et le hook
 * (`lib/use-inline-completion.ts`) ne fait que les câbler à un timer et à un
 * `fetch`. La raison est la même que d'habitude : ce sont ces règles-là qui ont
 * des cas limites, et ce sont elles qui portent le ressenti de vitesse.
 *
 * Le geste qui fait tout : **taper à travers le fantôme ne rappelle personne.**
 * Si l'humain écrit exactement ce que la suggestion proposait, on rogne le
 * fantôme d'autant, à la frappe, sans réseau. Un appel par suggestion, pas un
 * par caractère.
 */

import type { CompletionField } from "@/lib/server/issue-completion";

export type { CompletionField };

/**
 * En dessous, on se tait : trois mots de titre ne portent pas assez d'intention
 * pour qu'une suite soit autre chose qu'une invention. La description demande
 * plus — c'est de la prose, et compléter « Repro » n'a aucun sens.
 */
export const MIN_PREFIX_CHARS: Record<CompletionField, number> = {
  title: 6,
  description: 12,
};

/** Le temps de silence après la dernière touche avant de demander. */
export const DEBOUNCE_MS: Record<CompletionField, number> = {
  title: 180,
  description: 260,
};

/** Combien de caractères une Échap fait taire, avant que le fantôme revienne. */
export const DISMISS_GRACE_CHARS = 12;

/**
 * Faut-il demander une suggestion pour ce préfixe ?
 *
 * Le cas qui compte, et qui n'est pas une question de longueur : le « @ » en
 * cours de frappe. La description a son propre menu de mentions, qui prend
 * DÉJÀ Tab pour valider — deux surfaces sur la même touche au même instant, et
 * c'est l'une des deux qui gagne au hasard de l'ordre des plugins. On se retire
 * pendant qu'il est ouvert, ce qui est aussi ce qu'on ferait par politesse.
 */
export function shouldSuggest(field: CompletionField, prefix: string): boolean {
  if (prefix.trim().length < MIN_PREFIX_CHARS[field]) return false;
  // Une mention en cours de saisie (« @cl »), ou le « @ » qui vient d'être tapé.
  if (/@[\p{L}\p{N}_.-]*$/u.test(prefix)) return false;
  // Juste après un retour à la ligne : le début d'un paragraphe neuf n'a encore
  // rien dit, et une suggestion y serait une invention pure.
  if (/\n\s*$/.test(prefix)) return false;
  return true;
}

/**
 * Le fantôme survit-il à la frappe qui vient d'avoir lieu ?
 *
 * - une chaîne non vide → ce qu'il reste à afficher (on a tapé son début) ;
 * - `""` → il a été tapé EN ENTIER, il n'y a plus rien à montrer (l'appelant
 *   peut en redemander un neuf) ;
 * - `null` → la frappe s'en écarte, il est faux : on l'efface.
 *
 * La tolérance de l'espace de tête est le seul cas tordu : le fantôme peut
 * commencer par l'espace de jointure (« bug » après « Corriger le ») et l'humain
 * tape cet espace lui-même — c'est le même texte, pas une divergence.
 */
export function advanceSuggestion(
  suggestion: string,
  oldPrefix: string,
  newPrefix: string
): string | null {
  if (!newPrefix.startsWith(oldPrefix)) return null;
  const typed = newPrefix.slice(oldPrefix.length);
  if (typed === "") return suggestion;
  if (suggestion.startsWith(typed)) return suggestion.slice(typed.length);
  return null;
}

/** L'état d'une Échap : le préfixe où elle a eu lieu, ou `null`. */
export type Dismissal = string | null;

/**
 * Le fantôme est-il encore sous le coup d'une Échap ?
 *
 * Ni « pour toujours » ni « jusqu'à la touche suivante » : les deux sont faux.
 * Le premier condamne le champ pour la durée du ticket, le second rend l'Échap
 * décorative — le gris revient avant que le doigt ait quitté la touche. On tient
 * donc le silence le temps d'une douzaine de caractères, c'est-à-dire le temps
 * de finir l'idée qu'on avait en tête en refusant celle qu'on proposait.
 */
export function isDismissed(dismissed: Dismissal, prefix: string): boolean {
  if (dismissed === null) return false;
  if (!prefix.startsWith(dismissed)) return false;
  return prefix.length - dismissed.length < DISMISS_GRACE_CHARS;
}

/**
 * Ce que la description envoie au serveur comme préfixe : le texte du document
 * jusqu'au caret, borné aux derniers caractères. Le début d'une longue
 * description ne dit rien de la phrase en cours, et le prompt se paye en
 * latence.
 */
export const PREFIX_WINDOW_CHARS = 1200;

export function windowPrefix(text: string): string {
  return text.length <= PREFIX_WINDOW_CHARS ? text : text.slice(-PREFIX_WINDOW_CHARS);
}
