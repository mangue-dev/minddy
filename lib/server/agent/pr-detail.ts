import "server-only";

import { NextResponse } from "next/server";
import type { PullRequestReadiness } from "@/lib/pr-readiness";
import { isForgeApiError } from "./forge";
import { forgeErrorResponse } from "./pr-access";
import { readPullRequestReadiness } from "./pr-readiness-read";
import { resolvePrScope, type PrScope } from "./pr-scope";
import { findPullRequest } from "./pull-requests";

const READINESS_BATCH_CONCURRENCY = 4;

/**
 * GET detail: PR metadata, files and patches, CI checks, approvals, the merge
 * methods the forge offers, and what the reader may do (`viewer`).
 *
 * Reads stay on the installation token: any member of the minddy project sees
 * the PR without a connected git account. Only human writes change bearer.
 */
export async function prDetailResponse(scope: PrScope): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    // The files only need the PR number, and the readiness starts from the
    // stored head and base: none of them waits for the live PR. The
    // deployment card has its own route (`prDeploymentResponse`): its walk
    // through the forge's deployments took several sequential calls and held
    // the whole detail back for a badge (MIN-889).
    const prRead = forge.getPullRequest(call);
    const [pr, diff, readinessData] = await Promise.all([
      prRead,
      forge.listPullRequestFiles(call),
      readPullRequestReadiness(scope, prRead, undefined, {
        base: scope.pr.base_branch ?? null,
        headSha: scope.pr.head_sha ?? null,
      }),
    ]);

    return NextResponse.json({
      pr,
      files: diff.files,
      provider: scope.target.provider,
      checks: readinessData.checks,
      checksError: readinessData.checksError,
      deploymentUrl: readinessData.checks?.deploymentUrl ?? null,
      reviews: readinessData.reviews,
      reviewThreads: readinessData.reviewThreads,
      viewer: readinessData.viewer,
      mergeMethods: readinessData.mergePolicy.methods,
      mergePolicy: readinessData.mergePolicy,
      readiness: readinessData.readiness,
    });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * GET the deployment card of a pull request: the environment built from its
 * live head. Read after the detail has painted, since resolving it walks the
 * forge's deployments one reference at a time (MIN-889).
 */
export async function prDeploymentResponse(scope: PrScope): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    const pr = await forge.getPullRequest(call);
    // Deployment is tied to the live head.
    const outcome = pr.headSha ? await forge.getPullRequestDeployment({
      token: call.token,
      repoFullName: call.repoFullName,
      number: call.number,
      branch: pr.headFromBaseRepository ? pr.head : undefined,
      sha: pr.headSha,
    }).catch(() => {
      console.error("[pr-actions] deployment_unreadable");
      return null;
    }) : null;
    const settled = outcome && outcome.status !== "none" ? outcome : null;
    return NextResponse.json({
      headSha: pr.headSha ?? null,
      deploymentUrl: settled?.url ?? null,
      deploymentStatus: settled?.status ?? null,
      deploymentStartedAt: settled?.status === "in_progress" ? settled.startedAt : null,
      deploymentDurationMs: settled?.status === "success" ? settled.durationMs : null,
    });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/** GET compact readiness for several sidebar rows with bounded forge concurrency. */
export async function prReadinessBatchResponse(
  userId: string,
  prIds: readonly string[],
): Promise<NextResponse> {
  const readNotBefore = performance.now();
  const readiness: Record<string, PullRequestReadiness> = {};
  const mergeFlow: Record<string, { active: boolean; autoMergeAllowed: boolean | null; canWrite: boolean }> = {};
  const unavailablePrIds: string[] = [];
  let nextIndex = 0;
  let quota: { error: unknown; status: 403 | 429; until: number } | undefined;
  const deadlines = new Map<unknown, number>();
  const observeQuota = (error: unknown): boolean => {
    if (!isForgeApiError(error)) return false;
    const retryAfter = "retryAfter" in error && typeof error.retryAfter === "string" ? error.retryAfter : null;
    if (error.status !== 429 && !(error.status === 403 && retryAfter?.trim())) return false;
    let until = deadlines.get(error);
    if (until === undefined) {
      const now = Date.now();
      const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
      const parsed = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retryAfter ?? "");
      until = Number.isFinite(parsed) ? parsed : now + 60_000;
      deadlines.set(error, until);
    }
    if (!quota || until > quota.until) quota = { error, status: error.status as 403 | 429, until };
    return true;
  };
  const beforeRead = () => { if (quota) throw quota.error; };

  const readNext = async () => {
    while (!quota && nextIndex < prIds.length) {
      const prId = prIds[nextIndex++];
      try {
        let rowQuota: unknown;
        const batch = { beforeRead, onError: (error: unknown) => { if (observeQuota(error)) rowQuota = error; } };
        const pr = await findPullRequest(prId);
        beforeRead();
        const scope = pr ? await resolvePrScope(userId, pr, true, readNotBefore, batch) : null;
        beforeRead();
        if (!pr || !scope) {
          unavailablePrIds.push(prId);
          continue;
        }
        const forgePr = await scope.forge.getPullRequest(scope.call);
        const result = await readPullRequestReadiness(scope, forgePr, batch);
        if (rowQuota) throw rowQuota;
        readiness[prId] = result.readiness;
        mergeFlow[prId] = {
          active: !!forgePr.mergeFlowActive,
          autoMergeAllowed: result.mergePolicy.autoMergeAllowed,
          canWrite: result.viewer.capability === "write",
        };
      } catch (error) {
        observeQuota(error);
        console.error("[pr-actions] readiness_unavailable", prId);
        unavailablePrIds.push(prId);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(READINESS_BATCH_CONCURRENCY, prIds.length) },
      () => readNext(),
    ),
  );

  unavailablePrIds.push(...prIds.slice(nextIndex));
  // Completed rows remain usable; unavailable rows never acquire readiness.
  return NextResponse.json({ readiness, mergeFlow, unavailablePrIds, ...(quota ? { retryStatus: quota.status } : {}) },
    quota ? { headers: { "Retry-After": String(Math.max(0, Math.ceil((quota.until - Date.now()) / 1000))) } } : undefined);
}
