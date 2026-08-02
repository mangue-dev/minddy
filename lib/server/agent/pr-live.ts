import "server-only";

import { pullRequestTopic, type PrLivePart } from "@/lib/pr-live";
import type { RepoProviderId } from "@/lib/repo-providers";
import { broadcastToTopic } from "./live";
import { findPullRequestByNumber } from "./pull-requests";

/**
 * Diffusion EN DIRECT d'une pull request, sur le topic privé
 * `pull-request:{prId}` (migration 20260929090000_pull_request_realtime).
 *
 * UN seul message, `changed`, et il ne dit qu'une chose : telle partie de cette
 * PR a bougé. Le contenu ne voyage pas — il est lu chez la forge, avec le token
 * du LECTEUR, et il n'est pas le même pour tout le monde (une réaction porte un
 * `viewerIsActor`, les gestes offerts dépendent de `viewer.capability`). C'est
 * l'écran qui va relire, avec ses propres yeux (cf. lib/pr-live.ts).
 *
 * Deux familles d'émetteurs, et il faut les deux :
 *  - les RÉCEPTEURS WEBHOOK, pour ce qui se passe sur la forge ;
 *  - les ROUTES d'écriture in-app (`pr-actions.ts`), sans quoi un coéquipier qui
 *    regarde la même PR ne verrait rien avant l'écho webhook — et côté GitHub il
 *    n'y a AUCUN écho pour les réactions, l'événement n'existe pas.
 *
 * Tout est best-effort et fire-and-forget : une diffusion ratée ne doit jamais
 * faire échouer un webhook ni un geste de l'utilisateur. Le polling résiduel et
 * le refetch au retour d'onglet restent le filet.
 */

/** « Ces parties de cette PR ont bougé. » */
export function broadcastPrChanged(prId: string, parts: PrLivePart[]): void {
  if (parts.length === 0) return;
  void broadcastToTopic(pullRequestTopic(prId), "changed", {
    parts,
    at: Date.now(),
  });
}

/**
 * La même chose, quand on ne connaît qu'un NUMÉRO dans un dépôt : c'est tout ce
 * que porte un webhook. Silencieux si la PR n'est pas (encore) chez minddy —
 * personne ne peut la regarder, il n'y a personne à prévenir.
 *
 * `await` sur la résolution, `void` sur l'envoi : la lecture est ce qui donne
 * l'id, l'envoi est ce qu'on n'attend pas.
 */
export async function broadcastPrChangedByNumber(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  parts: PrLivePart[];
}): Promise<void> {
  if (opts.parts.length === 0) return;
  try {
    const pr = await findPullRequestByNumber({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      number: opts.number,
    });
    if (!pr) return;
    broadcastPrChanged(pr.id, opts.parts);
  } catch (err) {
    console.error("[pr-live] broadcast failed:", (err as Error).message);
  }
}
