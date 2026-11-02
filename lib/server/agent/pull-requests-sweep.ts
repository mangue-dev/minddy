import "server-only";

import { rememberReviewQueue } from "./pull-request-review-queue";
import type { RepoSyncState, VisibleRepo } from "./pull-requests";
import { resolveRepoCloneTargetForRepo } from "./repo-access";
import { stampRepoSync, syncRepoPullRequests } from "./pull-requests";

/** Share concurrent list and badge sweeps, without retaining credentials or results. */
const sweeps = new Map<string, Promise<boolean>>();

/**
 * Margin under the previous sweep. A PR the forge dated just before it may
 * not have been listed yet (replication lag, clock skew), and a failed sweep
 * stamps the repository all the same. An hour still fits in the first page.
 */
const SWEEP_OVERLAP_MS = 60 * 60_000;

/**
 * Catch a repository up at the forge. A repository already swept is read
 * incrementally, from its previous sweep: a full scan reread its last 500
 * PRs, about five seconds a repository, on every list read past the minute
 * window (MIN-889).
 */
export function sweepRepo(userId: string, repo: VisibleRepo, previous?: RepoSyncState): Promise<boolean> {
  const key = JSON.stringify([userId, repo.provider, repo.repoFullName]);
  const pending = sweeps.get(key);
  if (pending) return pending;
  const operation = performSweep(userId, repo, previous).finally(() => {
    if (sweeps.get(key) === operation) sweeps.delete(key);
  });
  sweeps.set(key, operation);
  return operation;
}

function sweepWindowStart(previous: RepoSyncState | undefined): string | undefined {
  const syncedAt = previous ? Date.parse(previous.synced_at) : Number.NaN;
  return Number.isFinite(syncedAt) ? new Date(syncedAt - SWEEP_OVERLAP_MS).toISOString() : undefined;
}

async function performSweep(userId: string, repo: VisibleRepo, previous?: RepoSyncState): Promise<boolean> {
  try {
    const target = await resolveRepoCloneTargetForRepo({
      userId,
      provider: repo.provider,
      repoFullName: repo.repoFullName,
    });
    if (!target) return false;
    const updatedSince = sweepWindowStart(previous);
    const { truncated } = await syncRepoPullRequests({
      provider: repo.provider,
      repoFullName: repo.repoFullName,
      token: target.token,
      includeReviewRequests: true,
      ...(updatedSince ? { updatedSince } : {}),
      // Only a full scan sees every open PR; a window would forget the
      // reviewers of the PRs it did not reread.
      onObserved: updatedSince ? undefined : (pulls) => { rememberReviewQueue(userId, repo, pulls); },
    });
    return truncated;
  } catch {
    console.error("[pull-requests] repository sweep failed");
    // We stamp all the same: a broken forge must not make the user retry the
    // scan on EACH view. The list stays as before, and the next window retries.
    await stampRepoSync(repo.provider, repo.repoFullName);
    return false;
  }
}
