import "server-only";

import {
  blockReadinessForRequestedReview,
  reducePullRequestReadiness,
  unavailableMergePolicy,
  type PullRequestReadiness,
  type RepositoryMergePolicy,
} from "@/lib/pr-readiness";
import type { ChecksSummary, PrViewer, PullRequestRef } from "@/lib/pull-request-contract";
import { isForgeApiError, type Forge } from "./forge";
import type { PrScope, ReadinessBatchReadControl } from "./pr-scope";
import { resolveViewer } from "./pr-viewer";

interface PullRequestReadinessResult {
  checks: ChecksSummary | null;
  checksError: "forbidden" | "unknown" | null;
  reviews: Awaited<ReturnType<Forge["listReviews"]>> | null;
  reviewThreads: Awaited<ReturnType<Forge["listReviewThreads"]>> | null;
  viewer: PrViewer;
  mergePolicy: RepositoryMergePolicy;
  readiness: PullRequestReadiness;
}

/** Read the merge-readiness data without loading a pull request diff. */
export async function readPullRequestReadiness(
  scope: PrScope,
  prInput: PullRequestRef | Promise<PullRequestRef>,
  batch?: ReadinessBatchReadControl,
  /**
   * The base and head stored for the PR. The policy and check reads start
   * from them instead of waiting for the live PR, and are read again when
   * the live PR disagrees (MIN-889).
   */
  stored?: { base: string | null; headSha: string | null },
): Promise<PullRequestReadinessResult> {
  batch?.beforeRead();
  const { forge, call } = scope;
  const live = Promise.resolve(prInput);
  const readPolicy = async (base: string | null | undefined): Promise<RepositoryMergePolicy> => {
    try {
      batch?.beforeRead();
      return base
        ? await forge.getRepositoryMergePolicy({ ...call, base })
        : unavailableMergePolicy(scope.target.provider, "unknown");
    } catch (error) {
      batch?.onError(error);
      return unavailableMergePolicy(
        scope.target.provider,
        isForgeApiError(error) && error.status === 403 ? "forbidden" : "unknown",
      );
    }
  };
  // Only the summary of the checks depends on the policy, not their requests:
  // for the PR on screen both reads run together. A batch keeps them in turn,
  // so a quota met by the policy stops it before the checks spend more.
  const readChecks = async (
    sha: string | null | undefined,
    policy: Promise<RepositoryMergePolicy>,
  ): Promise<{ checks: ChecksSummary | null; checksError: "forbidden" | "unknown" | null }> => {
    if (!sha) return { checks: null, checksError: null };
    if (batch) await policy;
    try {
      batch?.beforeRead();
      const checks = await forge.listChecks({
        ...call,
        sha,
        requiredCheckNames: policy.then((mergePolicy) => mergePolicy.requiredCheckNames),
        checksRequired: policy.then((mergePolicy) => mergePolicy.checksMustPass),
      });
      return { checks, checksError: null };
    } catch (error) {
      batch?.onError(error);
      return { checks: null, checksError: isForgeApiError(error) && error.status === 403 ? "forbidden" : "unknown" };
    }
  };
  // Policy and its dependent checks do not depend on reviews or actor lookup.
  const policyAndChecks = async () => {
    const guess = stored?.base && stored.headSha ? { base: stored.base, headSha: stored.headSha } : null;
    const refs: { base: string | null; headSha: string | null } = guess ??
      (await live.then((pr) => ({ base: pr.base ?? null, headSha: pr.headSha ?? null })));
    let policy = readPolicy(refs.base);
    let checks = readChecks(refs.headSha, policy);
    if (guess) {
      const pr = await live;
      const baseMoved = (pr.base ?? null) !== guess.base;
      if (baseMoved) policy = readPolicy(pr.base);
      if (baseMoved || (pr.headSha ?? null) !== guess.headSha) checks = readChecks(pr.headSha, policy);
    }
    const [mergePolicy, read] = await Promise.all([policy, checks]);
    return { mergePolicy, ...read };
  };
  const [reviews, reviewThreads, viewer, { mergePolicy, checks, checksError }] = await Promise.all([
    forge.listReviews(call).catch((error) => { batch?.onError(error); return null; }),
    forge.listReviewThreads(call).catch((error) => { batch?.onError(error); return null; }),
    resolveViewer(scope),
    policyAndChecks(),
  ]);
  const pr = await live;

  const baseReadiness = reducePullRequestReadiness({
    state: pr.state === "closed" ? "closed" : "open",
    merged: !!pr.merged,
    draft: !!pr.draft,
    mergeabilityReason: pr.mergeabilityReason,
    policy:
      reviews?.requiredApprovals != null
        ? { ...mergePolicy, requiredApprovals: reviews.requiredApprovals }
        : mergePolicy,
    checks: checks?.checks ?? null,
    checksStatus:
      checksError === "forbidden"
        ? "forbidden"
        : checksError
          ? "unavailable"
          : "loaded",
    approvals: reviews?.approvals ?? null,
    changesRequested: reviews?.changesRequested ?? null,
    reviewThreads,
    canWrite: viewer.capability === "write",
    mergeFlowActive: pr.mergeFlowActive,
  });
  const viewerLogin = viewer.login?.toLocaleLowerCase("en-US");
  const reviewRequested =
    pr.state === "open" &&
    !pr.merged &&
    !!viewerLogin &&
    (pr.requestedReviewers ?? []).some(
      (reviewer) => reviewer.login.toLocaleLowerCase("en-US") === viewerLogin,
    );

  return {
    checks,
    checksError,
    reviews,
    reviewThreads,
    viewer,
    mergePolicy,
    readiness: blockReadinessForRequestedReview(baseReadiness, reviewRequested),
  };
}
