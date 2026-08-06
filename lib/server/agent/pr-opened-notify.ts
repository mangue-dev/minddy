import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications, projectMemberIds } from "@/lib/server/notifications";
import type { NotificationRow } from "@/lib/server/notifications";
import { minddyUsersForForgeAccount } from "./pr-activity";
import { rowProvider, type PullRequestRow } from "./pull-requests";

/**
 * Inbox : « une pull request vient de s'ouvrir » — à TOUS les membres du projet
 * d'où elle se lit.
 *
 * C'est le seul moment de la vie d'une PR qui ne déclenchait rien. `pr_reviewed`
 * et `pr_merged` (MIN-138) préviennent l'auteur du run quand on relit ou fusionne
 * SA pull request ; l'ouverture, elle, ne concerne justement pas son auteur mais
 * les autres — c'est l'instant où le travail attend des yeux.
 *
 * **Peu importe d'où elle vient** : celle que Numo ouvre en fin de run comme
 * celle qu'un humain ouvre depuis la forge. Une PR existe → l'équipe l'apprend.
 *
 * Deux gardes, et deux seulement :
 *
 *   • on ne s'annonce pas à soi-même — le membre minddy derrière le compte de
 *     forge qui vient de l'ouvrir est retiré de la liste. Le lanceur d'un run,
 *     lui, reste dedans : il n'a pas ouvert cette PR, Numo l'a ouverte pour lui
 *     (même doctrine que les notifications d'agent, cf. `notifyAgentRun`) ;
 *   • une seule annonce par PR, quoi qu'il arrive. La même ouverture arrive par
 *     deux chemins (Numo l'ouvre, puis le webhook de la forge la rapporte), et
 *     les récepteurs écartent déjà l'écho par l'identité de l'acteur — ce
 *     verrou-ci ne dépend d'aucune identité, donc il tient même quand celle-ci
 *     se dérobe (compte de service renommé, hook rejoué).
 *
 * Best-effort de bout en bout : rien de ce qui suit ne remonte à l'appelant —
 * un webhook ne tombe pas parce qu'une notification n'a pas pu s'écrire.
 */
export async function notifyPullRequestOpened(
  pr: PullRequestRow | null,
  opts: {
    /** Le compte de forge qui l'a ouverte, tel que le hook le livre. */
    actor?: { accountId: string | null; login: string | null } | null;
  } = {},
): Promise<void> {
  // `upsertPullRequest` rend `null` quand l'écriture a échoué : pas de ligne, pas
  // de cible où renvoyer.
  if (!pr) return;

  try {
    const service = getServiceClient();

    // Déjà annoncée ? On s'arrête avant toute autre lecture.
    const { data: already } = await service
      .from("notifications")
      .select("id")
      .eq("pull_request_id", pr.id)
      .eq("type", "pr_opened")
      .limit(1);
    if (already?.length) return;

    const projectIds = await projectsForPr(pr);
    if (projectIds.length === 0) return;

    const excluded = new Set<string>();
    if (opts.actor?.accountId || opts.actor?.login) {
      const openers = await minddyUsersForForgeAccount({
        provider: rowProvider(pr),
        accountId: opts.actor.accountId ?? null,
        login: opts.actor.login ?? null,
      });
      for (const id of openers) excluded.add(id);
    }

    // Un membre présent dans deux projets qui lient le même dépôt ne reçoit
    // qu'UNE ligne : la PR est un fait du dépôt, pas d'un projet — le
    // `project_id` n'est là que pour le contexte, la destination est la PR.
    const rows: NotificationRow[] = [];
    const seen = new Set<string>();
    for (const projectId of projectIds) {
      for (const userId of await projectMemberIds(service, projectId)) {
        if (excluded.has(userId) || seen.has(userId)) continue;
        seen.add(userId);
        rows.push({
          user_id: userId,
          project_id: projectId,
          type: "pr_opened",
          issue_id: null,
          pull_request_id: pr.id,
          // L'auteur est un compte de forge, pas un utilisateur minddy : l'inbox
          // retombe sur l'icône du type, comme pour les autres gestes de PR.
          actor_id: null,
        });
      }
    }
    if (rows.length === 0) return;

    await insertNotifications(service, rows);
  } catch (e) {
    console.error("[pr-opened-notify] notify failed:", (e as Error).message);
  }
}

/**
 * Les projets d'où cette PR se lit.
 *
 * Son TICKET tranche quand elle en a un : c'est le projet de ce ticket, et lui
 * seul, même si le dépôt est lié ailleurs. Sans ticket — le cas normal d'une PR
 * humaine —, ce sont tous les projets qui lient le dépôt : c'est exactement ce
 * que la page Pull requests montre à chacun.
 */
async function projectsForPr(pr: PullRequestRow): Promise<string[]> {
  const service = getServiceClient();
  if (pr.issue_id) {
    const { data } = await service
      .from("issues")
      .select("project_id")
      .eq("id", pr.issue_id)
      .is("deleted_at", null)
      .maybeSingle();
    const projectId = (data as { project_id: string } | null)?.project_id;
    return projectId ? [projectId] : [];
  }
  const { data } = await service
    .from("project_git_links")
    .select("project_id")
    .eq("provider", pr.provider)
    .eq("repo_full_name", pr.repo_full_name);
  return [
    ...new Set(((data ?? []) as { project_id: string }[]).map((l) => l.project_id)),
  ];
}
