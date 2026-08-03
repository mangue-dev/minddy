import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import type { RepoProviderId } from "@/lib/repo-providers";
import { findPullRequestByNumber, type PullRequestRow } from "./pull-requests";

/**
 * `@numo` écrit DEPUIS la forge (MIN-162).
 *
 * Depuis minddy, la route de commentaire voit passer le message et déclenche la
 * passe elle-même. Depuis github.com, le seul signal est l'événement
 * `issue_comment` — que le récepteur traitait déjà, mais seulement pour tracer
 * « a commenté la PR ».
 *
 * Deux choses manquent au hook que la route a sous la main, et elles décident de
 * tout :
 *
 *  1. **Qui paye.** Un tour de modèle se compte sur un compte minddy
 *     (`ai_usage.user_id`), et l'auteur du commentaire n'en a pas forcément un.
 *     C'est donc le OWNER du projet du ticket lié qui porte la dépense — la même
 *     règle que partout ailleurs pour un travail de fond, et le seul compte dont
 *     l'existence est garantie. Sans ticket lié, il n'y a pas de projet, donc
 *     personne à qui imputer : on ne fait rien. C'est aussi lui qui sert à
 *     résoudre le token de forge, comme pour n'importe quelle lecture.
 *
 *  2. **Si ce message vient de nous.** Un commentaire posté depuis minddy revient
 *     par webhook quelques secondes plus tard : sans garde, la passe partirait
 *     deux fois. Trois filets, du plus sûr au plus large — l'auteur est le bot de
 *     l'App (écarté par l'appelant), l'écho reconnu sur l'événement que la route
 *     vient d'écrire (`isPrActionEcho`, chez l'appelant aussi), et la session
 *     déjà ouverte sur cette PR, vérifiée au moment de démarrer.
 *
 * Ce qui NE change pas selon la provenance : ce que `@numo` déclenche. Une
 * relecture, jamais un run de code — cf. `startNumoPrReview`.
 */

/** Le compte minddy qui portera la passe : le owner du projet du ticket lié. */
async function projectOwnerForPr(pr: PullRequestRow): Promise<string | null> {
  if (!pr.issue_id) return null;
  const service = getServiceClient();
  const { data } = await service
    .from("issues")
    .select("projects(owner_id)")
    .eq("id", pr.issue_id)
    .maybeSingle();
  const project = (data as { projects?: { owner_id?: string } | null } | null)?.projects;
  return project?.owner_id ?? null;
}

/**
 * Déclenche la relecture si ce commentaire de forge mentionne Numo. Ne lève
 * jamais : le webhook ne doit jamais échouer pour ça — la forge re-livrerait, et
 * la mention repartirait en boucle.
 */
export async function handleForgeNumoMention(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  prNumber: number;
  body: string | null | undefined;
  authorLogin: string | null;
}): Promise<void> {
  const body = opts.body ?? "";
  if (!mentionsNumo(body)) return;

  try {
    const pr = await findPullRequestByNumber({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      number: opts.prNumber,
    });
    if (!pr) return;

    const userId = await projectOwnerForPr(pr);
    if (!userId) {
      // PR non rattachée à un ticket : personne à qui imputer la dépense, et
      // aucun projet dont lire les droits. On le dit, plutôt que de deviner.
      console.warn(
        `[pr-mention] @numo ignoré sur ${opts.repoFullName}#${opts.prNumber} : PR sans ticket`,
      );
      return;
    }

    // Import paresseux : `pr-actions` tire tout le module des routes PR (et
    // `next/server`), là où ce fichier est chargé par le récepteur de webhook.
    const { resolvePrScope, startNumoPrReview } = await import("./pr-actions");
    const scope = await resolvePrScope(userId, pr);
    if (!scope) return;

    await startNumoPrReview({
      scope,
      userId,
      question: { author: opts.authorLogin, body },
    });
  } catch (err) {
    console.error("[pr-mention] @numo depuis la forge a échoué :", (err as Error).message);
  }
}
