import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import type { RepoProviderId } from "@/lib/repo-providers";
import { findPullRequestByNumber, type PullRequestRow } from "./pull-requests";
// Type seulement : l'import de valeur reste paresseux plus bas (`pr-actions`
// tire tout le module des routes PR, et `next/server` avec lui).
import type { PrScope } from "./pr-actions";
import {
  claimDenialNotice,
  claimMemberMention,
  isForgeAuthorMember,
  MENTION_LIMIT_PER_AUTHOR,
} from "./forge-mention-guard";

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
 *  2. **Qui a le droit de le faire payer.** Le corps du commentaire vient de la
 *     forge, où un dépôt public laisse écrire n'importe qui. L'auteur doit donc
 *     être rattachable à un membre d'un projet qui lie ce dépôt, et son
 *     déclenchement reste borné dans le temps — les deux gardes vivent dans
 *     `forge-mention-guard.ts`, qui porte aussi le pourquoi du refus par défaut.
 *
 *  3. **Si ce message vient de nous.** Un commentaire posté depuis minddy revient
 *     par webhook quelques secondes plus tard : sans garde, la passe partirait
 *     deux fois. Trois filets, du plus sûr au plus large — l'auteur est le bot de
 *     l'App (écarté par l'appelant), l'écho reconnu sur l'événement que la route
 *     vient d'écrire (`isPrActionEcho`, chez l'appelant aussi), et la session
 *     déjà ouverte sur cette PR, vérifiée au moment de démarrer.
 *
 * Ce qui NE change pas selon la provenance : ce que `@numo` déclenche. Une
 * relecture, jamais un run de code — cf. `startNumoPrReview`.
 */

/** Les projets qui ont voix au chapitre sur cette PR, dans l'ordre du payeur. */
interface MentionScope {
  /** Le compte minddy qui portera la relecture. */
  userId: string;
  /** Tous les projets concernés : c'est parmi LEURS membres qu'on cherche l'auteur. */
  projectIds: string[];
}

/**
 * Le compte minddy qui portera la relecture, et les projets où chercher l'auteur
 * du commentaire. Deux chemins pour le payeur, dans cet ordre : le owner du
 * projet du TICKET lié quand il y en a un (c'est son projet qui est concerné),
 * sinon le owner d'un projet qui LIE LE DÉPÔT. Null seulement quand plus
 * personne ne connaît ce dépôt.
 *
 * L'appartenance, elle, se juge sur TOUS ces projets et pas seulement celui du
 * payeur : deux projets peuvent lier le même dépôt, et un membre de l'un comme
 * de l'autre est chez lui sur cette pull request.
 */
async function scopeForPr(pr: PullRequestRow): Promise<MentionScope | null> {
  const service = getServiceClient();
  const ordered: Array<{ id: string; owner: string | null }> = [];

  if (pr.issue_id) {
    const { data } = await service
      .from("issues")
      .select("project_id, projects(owner_id)")
      .eq("id", pr.issue_id)
      .maybeSingle();
    const row = data as {
      project_id?: string | null;
      projects?: { owner_id?: string } | null;
    } | null;
    if (row?.project_id) {
      ordered.push({ id: row.project_id, owner: row.projects?.owner_id ?? null });
    }
  }

  // PR sans ticket : le dépôt reste rattaché à des projets, et l'un d'eux a un
  // owner. Ordonné par date de liaison pour que le choix soit STABLE d'une
  // mention à l'autre — deux projets qui lient le même dépôt ne doivent pas se
  // renvoyer la facture au hasard.
  const { data } = await service
    .from("project_git_links")
    .select("project_id, created_at, projects(owner_id)")
    .eq("provider", pr.provider)
    .eq("repo_full_name", pr.repo_full_name)
    .order("created_at", { ascending: true });
  for (const row of (data ?? []) as Array<{
    project_id?: string | null;
    projects?: { owner_id?: string } | null;
  }>) {
    if (!row.project_id || ordered.some((p) => p.id === row.project_id)) continue;
    ordered.push({ id: row.project_id, owner: row.projects?.owner_id ?? null });
  }

  const userId = ordered.find((p) => p.owner)?.owner;
  if (!userId) return null;
  return { userId, projectIds: ordered.map((p) => p.id) };
}

/**
 * Les deux refus, tels qu'ils s'écrivent sous le commentaire. En anglais comme
 * le reste de ce que Numo dit à la forge (son prompt, ses erreurs d'outil) : ce
 * fil est lu par des comptes de forge, pas par une session minddy dont on
 * connaîtrait la langue.
 */
const DENIAL_BODIES = {
  notMember: (login: string | null) =>
    `${login ? `@${login} — ` : ""}I only take requests from members of the minddy ` +
    `project this repository is linked to, with their git account connected in ` +
    `minddy. Nothing was started.\n\n` +
    `If you are on the team, connect your git account in minddy (Settings → ` +
    `Git accounts) and mention me again.`,
  throttled: `That's a lot of \`@numo\` on this repository in the last hour, so I ` +
    `stopped there (${MENTION_LIMIT_PER_AUTHOR} reviews per person per hour). ` +
    `Mention me again later, or start the review from minddy.`,
} as const;

/** Poste le refus sous la pull request. Best-effort : ne lève jamais. */
async function replyOnPr(scope: PrScope, body: string): Promise<void> {
  try {
    await scope.forge.createPullRequestComment({ ...scope.call, body });
  } catch (err) {
    // Le refus lui-même n'a pas à faire échouer le webhook : la mention est déjà
    // rejetée, ce commentaire n'est que la politesse qui l'explique.
    console.warn("[pr-mention] refus non commenté :", (err as Error).message);
  }
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

    const target = await scopeForPr(pr);
    if (!target) {
      // Plus AUCUN projet ne lie ce dépôt (liaison retirée depuis) : personne à
      // qui imputer la dépense, et aucun droit à lire. On le dit, plutôt que de
      // deviner un compte.
      console.warn(
        `[pr-mention] @numo ignoré sur ${opts.repoFullName}#${opts.prNumber} : aucun projet ne lie ce dépôt`,
      );
      return;
    }
    const { userId, projectIds } = target;

    // MIN-330 — l'autorisation AVANT le débit : un inconnu ne doit pas consommer
    // le compteur d'un dépôt (ce serait un déni de service sur les membres), il
    // a le sien, qui ne sert qu'à ne lui répondre qu'une fois.
    const member = await isForgeAuthorMember({
      provider: opts.provider,
      projectIds,
      authorLogin: opts.authorLogin,
    });
    const throttle = member
      ? await claimMemberMention({
          provider: opts.provider,
          repoFullName: opts.repoFullName,
          authorLogin: opts.authorLogin,
        })
      : { allowed: false, notify: false };

    if (!member || !throttle.allowed) {
      const notify = member
        ? throttle.notify
        : await claimDenialNotice({
            provider: opts.provider,
            repoFullName: opts.repoFullName,
            authorLogin: opts.authorLogin,
          });
      console.warn(
        `[pr-mention] @numo refusé sur ${opts.repoFullName}#${opts.prNumber} ` +
          `(${opts.authorLogin ?? "auteur inconnu"}) : ${member ? "débit" : "non-membre"}`,
      );
      if (!notify) return;
      // Résoudre la portée COÛTE un token de forge : on ne le fait que pour le
      // seul refus qu'on commente, pas pour chacun d'eux.
      const { resolvePrScope } = await import("./pr-actions");
      const scope = await resolvePrScope(userId, pr);
      if (scope) {
        await replyOnPr(
          scope,
          member ? DENIAL_BODIES.throttled : DENIAL_BODIES.notMember(opts.authorLogin),
        );
      }
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
