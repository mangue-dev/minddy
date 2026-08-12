/**
 * LE MESSAGE DE COMMIT D'UNE FIN DE TOUR — la première ligne de ce que l'agent a
 * répondu, nettoyée et bornée, avec un repli quand elle ne dit rien.
 *
 * Module PUR, sorti de [vm/turn.ts](vm/turn.ts) par MIN-286. Deux moteurs
 * commitent désormais : la boucle maison et le superviseur d'opencode. Le laisser
 * dans l'un obligeait l'autre à l'importer — donc à traîner toute la boucle dans
 * son graphe, alors qu'elle est vouée à disparaître au lot 3.
 */

/** Le message de commit d'un tour, dérivé de la réponse de l'agent. */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
}
