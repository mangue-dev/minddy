/**
 * Réconciliation des bulles utilisateur OPTIMISTES de la conversation de l'agent.
 *
 * Un message envoyé à une session ne revient pas tout de suite : il atterrit dans
 * `agent_run_messages`, et ne devient un event `user_message` (donc une bulle) que
 * lorsque la BOUCLE le draine — réveil de la sandbox compris, soit plusieurs
 * secondes. En attendant, on affiche la bulle localement.
 *
 * Le problème est de savoir QUAND la retirer, sans la faire disparaître trop tôt
 * (l'utilisateur croirait son message perdu) ni la laisser en double une fois l'écho
 * arrivé. D'où une soustraction en MULTI-ENSEMBLE plutôt qu'un simple « ce texte
 * existe-t-il déjà ? » : deux « continue » envoyés à la suite doivent rester DEUX
 * bulles, et n'en retirer qu'une quand le premier écho arrive.
 *
 * Logique pure (sans React) : isolée ici pour être testable en node/vitest, comme
 * prune.ts / caching.ts.
 */

/**
 * Les messages en attente qui n'ont PAS encore leur écho serveur — donc ceux qu'il
 * faut encore afficher soi-même.
 *
 * REND LES ÉLÉMENTS D'ENTRÉE, pas leurs textes : un message en attente porte
 * aussi ses MENTIONS, et les retrouver après coup par égalité de texte
 * réattribuait les pilules du premier « ok » au second (celui qui citait un
 * ticket). Le texte n'identifie rien — c'est même tout le sujet de la
 * soustraction ci-dessous.
 *
 * @param pending  messages envoyés depuis l'ouverture de la session, dans l'ordre.
 *                 La liste n'est jamais purgée en cas de succès : c'est justement ce
 *                 qui fait marcher la soustraction (n envoyés − m échoés = à afficher).
 * @param echoed   textes des messages `user` déjà présents dans le fil (échos
 *                 serveur ET prompt de lancement).
 */
export function unechoedMessages<T extends string | { text: string }>(
  pending: readonly T[],
  echoed: readonly string[],
): T[] {
  const counts = new Map<string, number>();
  for (const text of echoed) {
    const key = text.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return pending.filter((message) => {
    const key = (typeof message === "string" ? message : message.text).trim();
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1); // cet envoi est consommé par son écho
      return false;
    }
    return true;
  });
}
