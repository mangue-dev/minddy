"use client";

/**
 * Ce que le wizard de création tend au board qu'il vient d'ouvrir (MIN-171).
 *
 * L'amorce se joue APRÈS la création : le wizard finit sur
 * `/projects/{id}?setup=numo|import`, et la surface qui s'y ouvre a besoin de
 * ce qui a été saisi une étape plus tôt — le brief collé, le CSV déposé.
 *
 * En mémoire, pas en sessionStorage : un `File` ne se sérialise pas, et la
 * navigation est un `router.push` côté client, donc le même contexte JS. Une
 * relance complète (rechargement, lien rouvert plus tard) perd la remise et la
 * surface s'ouvre vide — ce qui est exactement ce qu'elle doit faire quand elle
 * n'a rien reçu (Numo ouvre alors sur ses questions, l'import sur sa zone de
 * dépôt).
 *
 * La remise est à USAGE UNIQUE : le board la prend, elle disparaît. Sinon le
 * même brief se re-proposerait au prochain passage sur ce board.
 */

export type SeedHandoff =
  /** Le brief devient le PREMIER MESSAGE d'une conversation avec Numo
   *  (MIN-173) ; `null` quand l'utilisateur a préféré partir de ses questions. */
  | { kind: "numo"; brief: string | null }
  | { kind: "import"; file: File };

let pending: SeedHandoff | null = null;

export function putSeedHandoff(handoff: SeedHandoff): void {
  pending = handoff;
}

/** La remise en attente, consommée : le prochain appel rend `null`. */
export function takeSeedHandoff(): SeedHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}
