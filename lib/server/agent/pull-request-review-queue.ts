import "server-only";
import type { VisibleRepo } from "./pull-requests";
import type { PullRequestRef } from "./pr";
import { forgeFor } from "./forge";
import { resolveRepoCloneTargetForRepo } from "./repo-access";

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
type Snapshot = Map<number, string[]>;
const snapshots = new Map<string, { at: number; reviewers: Snapshot }>();
const pending = new Map<string, Promise<Snapshot>>();
const cacheKey = (userId: string, repo: Pick<VisibleRepo, "provider" | "repoFullName">) =>
  JSON.stringify([userId, repo.provider, repo.repoFullName]);

/** Reuse discovery observations, retaining only pending reviewer logins. */
export function rememberReviewQueue(userId: string, repo: Pick<VisibleRepo, "provider" | "repoFullName">, pulls: PullRequestRef[]) {
  const key = cacheKey(userId, repo);
  const reviewers = new Map(pulls.map((pr) => [pr.number, (pr.requestedReviewers ?? []).map((reviewer) => reviewer.login)]));
  snapshots.delete(key);
  snapshots.set(key, { at: Date.now(), reviewers });
  while (snapshots.size > MAX_ENTRIES) snapshots.delete(snapshots.keys().next().value!);
  return reviewers;
}

/** The caller must supply a repository from its authenticated, visible scope. */
export function readReviewQueue(userId: string, repo: VisibleRepo): Promise<Snapshot> {
  const key = cacheKey(userId, repo);
  const snapshot = snapshots.get(key);
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return Promise.resolve(snapshot.reviewers);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  let operation!: Promise<Snapshot>;
  operation = (async () => {
    const target = await resolveRepoCloneTargetForRepo({ userId, provider: repo.provider, repoFullName: repo.repoFullName });
    if (!target) return new Map<number, string[]>();
    const { pulls } = await forgeFor(repo.provider).listPullRequests({ token: target.token, repoFullName: repo.repoFullName, includeReviewRequests: true });
    if (pending.get(key) === operation) return rememberReviewQueue(userId, repo, pulls);
    return new Map(pulls.map((pr) => [pr.number, (pr.requestedReviewers ?? []).map((reviewer) => reviewer.login)]));
  })().finally(() => { if (pending.get(key) === operation) pending.delete(key); });
  pending.set(key, operation);
  return operation;
}

export function invalidateReviewQueue(provider: string, repoFullName: string) {
  for (const key of new Set([...snapshots.keys(), ...pending.keys()])) {
    const [, cachedProvider, cachedRepo] = JSON.parse(key) as string[];
    if (cachedProvider === provider && cachedRepo === repoFullName) { snapshots.delete(key); pending.delete(key); }
  }
}
