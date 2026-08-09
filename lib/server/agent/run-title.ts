/**
 * Ce qu'on donne au titreur (`generateShortTitle`) pour nommer une conversation
 * de l'agent — et rien d'autre : la fonction est pure, elle assemble un texte.
 *
 * Deux morceaux, dans cet ordre : le TICKET (de quoi on parle) puis la CONSIGNE
 * (ce qu'on a demandé). Une conversation ancrée à un ticket a besoin des deux —
 * la consigne seule est souvent une anaphore (« implémente ça », « regarde le
 * middleware ») qui ne nomme rien, et le titre du ticket seul ne dit pas ce qu'on
 * a demandé quand on lui parle trois fois de suite. Le titreur tranche entre les
 * deux ; ici on ne fait que les lui poser côte à côte.
 *
 * Une conversation SANS ticket (carnet, MIN-84) n'a que sa note, et c'est déjà
 * la mission : elle passe telle quelle.
 *
 * `null` = rien à résumer (ni ticket ni consigne) → l'appelant saute l'appel au
 * modèle plutôt que de lui envoyer une chaîne vide.
 */
export function agentRunTitleSource({
  issueTitle,
  prompt,
}: {
  issueTitle?: string | null;
  prompt?: string | null;
}): string | null {
  const parts = [issueTitle?.trim(), prompt?.trim()].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join("\n\n") : null;
}
