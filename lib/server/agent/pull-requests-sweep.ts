import "server-only";

import type { VisibleRepo } from "./pull-requests";
import { resolveRepoCloneTargetForRepo } from "./repo-access";
import { stampRepoSync, syncRepoPullRequests } from "./pull-requests";

/**
 * Out-of-band catch-up sweep of ONE repository (MIN-595).
 *
 * Shared by every route that wants the background sync without blocking its
 * response — the Pull Requests list (`after()` on a stale repo) and the
 * lightweight badge count (`after()` for the same reason): a sweep runs at
 * most once per `REPO_SYNC_TTL_MS` window per repository, stamped in
 * `pull_request_syncs`, so several concurrent callers coalesce into one
 * paginated forge read. The sweep is what keeps `pull_requests` rows honest
 * when a webhook was lost — and the row write is what broadcasts to the
 * project topic, which is what moves the badge and the list without the user
 * visiting the page.
 *
 * Best effort, like every ingestion path: a broken forge must never make the
 * caller retry sooner than the next TTL window. On failure we stamp anyway —
 * the list stays as it was, and the next window tries again.
 */
export async function sweepRepo(userId: string, repo: VisibleRepo): Promise<boolean> {
  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (!target) return false;
    const { truncated } = await syncRepoPullRequests({
      provider: repo.provider,
      repoFullName: repo.repoFullName,
      token: target.token,
    });
    return truncated;
  } catch (err) {
    console.error(
      `[pull-requests] sweep ${repo.repoFullName} failed:`,
      (err as Error).message,
    );
    // We stamp all the same: a broken forge must not make the user retry the
    // scan on EACH view. The list stays as before, and the next window retries.
    await stampRepoSync(repo.provider, repo.repoFullName);
    return false;
  }
}
