/**
 * Quel champ du formulaire inline reçoit le curseur à l'ouverture.
 *
 * La règle utile est « le premier champ qui reste à remplir » : sur un
 * formulaire à plusieurs champs dont les premiers sont déjà répondus, on veut
 * atterrir sur la suite, pas revenir en arrière.
 *
 * Le cas qui manquait est celui où il ne reste RIEN à remplir — un formulaire
 * entièrement pré-rempli. Il n'existait pas tant que les seuls formulaires du
 * produit étaient des `select` volontairement vides (« pas de prefill : le
 * champ vide reçoit l'autofocus, donc le dropdown s'ouvre immédiatement »).
 * Renommer une vue enregistrée l'a fait apparaître : le champ arrive avec le
 * nom actuel, donc aucun champ n'est « à remplir », donc plus personne ne
 * prenait le curseur — il fallait aller cliquer dedans.
 *
 * Un formulaire pré-rempli n'est pas un formulaire fini : c'est une proposition.
 * On se pose donc sur le PREMIER champ, prêt à être remplacé (l'appelant
 * sélectionne son contenu), et Entrée valide la proposition telle quelle.
 *
 * Extrait en fonction pure parce que c'est la règle qui se teste, pas le rendu.
 */

/** Le champ porte-t-il déjà une réponse ? */
function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return value != null;
}

/**
 * L'index du champ à focaliser, ou `-1` s'il n'y a aucun champ.
 *
 * @param keys  les clés des champs, dans l'ordre d'affichage
 * @param values les valeurs courantes du formulaire
 */
export function autoFocusFieldIndex(
  keys: readonly string[],
  values: Record<string, unknown>
): number {
  if (keys.length === 0) return -1;
  const unfilled = keys.findIndex((key) => !isFilled(values[key]));
  // Tout est rempli → le premier champ, pour pouvoir écrire par-dessus.
  return unfilled === -1 ? 0 : unfilled;
}
