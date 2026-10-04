import "server-only";

import type { VisibleRepo } from "./pull-requests";
import { resolveRepoCloneTargetForRepo } from "./repo-access";
import { stampRepoSync, syncRepoPullRequests } from "./pull-requests";

/** Share concurrent list and badge sweeps, without retaining credentials or results. */
const sweeps = new Map<string, Promise<boolean>>();

export function sweepRepo(userId: string, repo: VisibleRepo): Promise<boolean> {
  const key = JSON.stringify([userId, repo.provider, repo.repoFullName]);
  const pending = sweeps.get(key);
  if (pending) return pending;
  const operation = performSweep(userId, repo).finally(() => {
    if (sweeps.get(key) === operation) sweeps.delete(key);
  });
  sweeps.set(key, operation);
  return operation;
}

async function performSweep(userId: string, repo: VisibleRepo): Promise<boolean> {
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
  } catch {
    console.error("[pull-requests] repository sweep failed");
    // We stamp all the same: a broken forge must not make the user retry the
    // scan on EACH view. The list stays as before, and the next window retries.
    await stampRepoSync(repo.provider, repo.repoFullName);
    return false;
  }
}
