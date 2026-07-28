/**
 * Ce qu'est une règle d'affectation *écrite*, pour Smart Assign (MIN-31).
 *
 * Trois endroits posent la même question et doivent y répondre pareil : le
 * runner qui choisit un assigné (lib/server/smart-assign.ts), l'avertissement
 * du tableau de bord, et les réglages du projet qui montrent ce qui manque. La
 * réponse tient en une ligne — une chaîne de blancs ne compte pas — mais c'est
 * exactement le genre de ligne qui diverge quand elle est écrite trois fois.
 */

/** Les membres, parmi ceux passés, qui n'ont pas de règle écrite. */
export function userIdsWithoutRule(
  userIds: string[],
  rules: Record<string, string> | null | undefined
): string[] {
  return userIds.filter((id) => !rules?.[id]?.trim());
}

/** Au moins une règle écrite dans l'équipe — sans quoi le modèle n'aurait que
    des noms à comparer, et l'affectation retombe sur le owner. */
export function hasAnyRule(
  userIds: string[],
  rules: Record<string, string> | null | undefined
): boolean {
  return userIds.some((id) => !!rules?.[id]?.trim());
}
