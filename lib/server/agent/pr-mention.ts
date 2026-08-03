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
 *     C'est donc le OWNER d'un projet qui porte la dépense — la même règle que
 *     partout ailleurs pour un travail de fond, et le seul compte dont
 *     l'existence est garantie. C'est aussi lui qui sert à résoudre le token de
 *     forge, comme pour n'importe quelle lecture.
 *
 *     Ce projet se trouvait par le TICKET lié, et une PR sans ticket voyait donc
 *     sa mention ignorée. C'était un raccourci, corrigé par MIN-168 : une pull
 *     request n'appartient pas à un ticket, elle appartient à un DÉPÔT, que des
 *     projets lient (`project_git_links`) — exactement la résolution qui sert au
 *     bouton « faire vérifier par Numo ». Le ticket reste le meilleur chemin
 *     quand il existe (c'est SON projet qui est concerné) ; sans lui, on prend un
 *     projet qui lie le dépôt. Sans aucun des deux, il n'y a vraiment personne :
 *     on ne fait rien.
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

/**
 * Le compte minddy qui portera la relecture. Deux chemins, dans cet ordre :
 * le owner du projet du TICKET lié quand il y en a un (c'est son projet qui est
 * concerné), sinon le owner d'un projet qui LIE LE DÉPÔT. Null seulement quand
 * plus personne ne connaît ce dépôt.
 */
async function payerForPr(pr: PullRequestRow): Promise<string | null> {
  const service = getServiceClient();

  if (pr.issue_id) {
    const { data } = await service
      .from("issues")
      .select("projects(owner_id)")
      .eq("id", pr.issue_id)
      .maybeSingle();
    const owner = (data as { projects?: { owner_id?: string } | null } | null)?.projects
      ?.owner_id;
    if (owner) return owner;
  }

  // PR sans ticket : le dépôt reste rattaché à des projets, et l'un d'eux a un
  // owner. Ordonné par date de liaison pour que le choix soit STABLE d'une
  // mention à l'autre — deux projets qui lient le même dépôt ne doivent pas se
  // renvoyer la facture au hasard.
  const { data } = await service
    .from("project_git_links")
    .select("created_at, projects(owner_id)")
    .eq("provider", pr.provider)
    .eq("repo_full_name", pr.repo_full_name)
    .order("created_at", { ascending: true });
  for (const row of (data ?? []) as Array<{ projects?: { owner_id?: string } | null }>) {
    const owner = row.projects?.owner_id;
    if (owner) return owner;
  }
  return null;
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

    const userId = await payerForPr(pr);
    if (!userId) {
      // Plus AUCUN projet ne lie ce dépôt (liaison retirée depuis) : personne à
      // qui imputer la dépense, et aucun droit à lire. On le dit, plutôt que de
      // deviner un compte.
      console.warn(
        `[pr-mention] @numo ignoré sur ${opts.repoFullName}#${opts.prNumber} : aucun projet ne lie ce dépôt`,
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
