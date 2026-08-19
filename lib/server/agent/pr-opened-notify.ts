import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications, projectMemberIds } from "@/lib/server/notifications";
import type { NotificationRow } from "@/lib/server/notifications";
import { minddyUsersForForgeAccount } from "./pr-activity";
import { rowProvider, type PullRequestRow } from "./pull-requests";

/**
 * Inbox: "a pull request has just opened" — to ALL project members
 * where it reads.
 *
 * This is the only moment in the life of a PR that didn't trigger anything. `pr_reviewed`
 * and `pr_merged` (MIN-138) warn the author of the run when rereading or merging
 * SA pull request; the opening, for its part, does not concern its author but
 * the others — it is the moment when the work awaits the eyes.
 *
 * **It does not matter where it comes from**: the one that Numo opens at the end of the run like
 * the one that a human opens from the forge. A PR exists → the team learns it.
 *
 * Two guards, and two only:
 *
 * • we do not announce ourselves — the minddy member behind the account of
 * forge who has just opened it is removed from the list. The launcher of a run,
 * stays inside: he did not open this PR, Numo opened it for him
 * (same doctrine as agent notifications, cf. `notifyAgentRun`);
 * • only one announcement per PR, whatever happens. The same opening arrives by
 * two paths (Numo opens it, then the forge webhook brings it back), and
 * the receivers already dismiss the echo by the identity of the actor — this
 * lock does not depend on any identity, so it holds even when this one
 * slips away (service account renamed, hook replayed).
 *
 * End-to-end best effort: nothing that follows goes back to the caller —
 * a webhook does not drop because a notification failed to write.
 */
export async function notifyPullRequestOpened(
  pr: PullRequestRow | null,
  opts: {
    /** The forge account that opened it, as the hook delivers it. */
    actor?: { accountId: string | null; login: string | null } | null;
  } = {},
): Promise<void> {
  // `upsertPullRequest` returns `null` when write failed: no line, no
  // target to return to.
  if (!pr) return;

  try {
    const service = getServiceClient();

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

    // A member present in two projects which link the same repository does not receive
    // that ONE line: the PR is a fact of the deposit, not of a project — the
    // `project_id` is only there for context, the destination is the PR.
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
          // The author is a forge account, not a minddy user: the inbox
          // falls back to the type icon, as with other PR gestures.
          actor_id: null,
        });
      }
    }
    if (rows.length === 0) return;

    await insertNotifications(service, rows, { deduplicatePullRequestOpened: true });
  } catch (e) {
    console.error("[pr-opened-notify] notify failed:", (e as Error).message);
  }
}

/**
 * The projects from which this PR reads.
 *
 * Her TICKET decides when she has one: it is the project of this ticket, and it
 * alone, even if the repository is linked elsewhere. Without a ticket — the normal case of a human PR
 * — all the projects link the repository: it is exactly this
 * that the Pull requests page shows to everyone.
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
