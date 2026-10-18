"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { ALL_PULL_REQUESTS_QUERY_KEY } from "./pull-request-list-cache";
import { linkPullRequestIssueApi, unlinkPullRequestIssueApi, type IssuePr } from "./agent-api";
import type { IssuePrPayload } from "./issue-pr-store";

/** The pull request a board action links issues to. */
export interface LinkTargetPullRequest {
  prId: string;
  prNumber: number;
  state: string;
}

export interface LinkIssuesOutcome {
  linked: string[];
  failed: Array<{ issueId: string; message: string }>;
}

/** The boards' per-issue PR caches (every project and global scope). */
const ISSUE_PRS_PREFIX = ["issue-pull-requests"] as const;

const issuePrState = (state: string): IssuePr["state"] =>
  state === "draft" || state === "merged" || state === "closed" ? state : "open";

/**
 * Optimistic board update: the chips change before the server answers. The
 * refetch that follows every request puts back whatever the server refused.
 */
export function optimisticIssuePrs(
  payload: IssuePrPayload | undefined,
  change: { link: LinkTargetPullRequest; issueIds: readonly string[] } | { unlinkIssueIds: readonly string[] },
): IssuePrPayload | undefined {
  if (!payload) return payload;
  const pullRequests = { ...payload.pullRequests };
  const linkedPullRequestIds = { ...payload.linkedPullRequestIds };
  if ("link" in change) {
    const pr: IssuePr = { prId: change.link.prId, prNumber: change.link.prNumber, state: issuePrState(change.link.state) };
    for (const issueId of change.issueIds) {
      pullRequests[issueId] = pr;
      linkedPullRequestIds[issueId] = [...new Set([...(linkedPullRequestIds[issueId] ?? []), pr.prId])];
    }
  } else {
    for (const issueId of change.unlinkIssueIds) {
      delete pullRequests[issueId];
      delete linkedPullRequestIds[issueId];
    }
  }
  return { ...payload, pullRequests, linkedPullRequestIds };
}

/**
 * Link several issues to one pull request, one request per issue: the server
 * checks each issue on its own (its project must link the repository, and an
 * issue keeps at most one live pull request), so a refusal never blocks the
 * others.
 */
export async function linkIssuesToPullRequest(
  issueIds: readonly string[],
  pr: LinkTargetPullRequest,
  link: typeof linkPullRequestIssueApi = linkPullRequestIssueApi,
): Promise<LinkIssuesOutcome> {
  return settle(issueIds, (issueId) => link(pr.prId, issueId, pr.state));
}

/** Remove every pull request link of each issue, one request per link. */
export async function unlinkIssuesFromPullRequests(
  links: ReadonlyArray<{ issueId: string; prIds: readonly string[] }>,
  unlink: typeof unlinkPullRequestIssueApi = unlinkPullRequestIssueApi,
): Promise<LinkIssuesOutcome> {
  const withLinks = links.filter((link) => link.prIds.length > 0);
  return settle(withLinks.map((link) => link.issueId), (issueId) => {
    const prIds = withLinks.find((link) => link.issueId === issueId)!.prIds;
    return Promise.all(prIds.map((prId) => unlink(prId, issueId)));
  });
}

async function settle(
  issueIds: readonly string[],
  run: (issueId: string) => Promise<unknown>,
): Promise<LinkIssuesOutcome> {
  const results = await Promise.allSettled(issueIds.map(run));
  const outcome: LinkIssuesOutcome = { linked: [], failed: [] };
  results.forEach((result, index) => {
    const issueId = issueIds[index];
    if (result.status === "fulfilled") outcome.linked.push(issueId);
    else outcome.failed.push({
      issueId,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });
  return outcome;
}

async function refreshPullRequestCaches(queryClient: QueryClient, prIds: readonly string[], issueIds: readonly string[]) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ALL_PULL_REQUESTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ISSUE_PRS_PREFIX }),
    ...prIds.map((prId) => queryClient.invalidateQueries({ queryKey: ["pull-request", prId] })),
    ...issueIds.map((issueId) => queryClient.invalidateQueries({ queryKey: ["issue-pull-request", issueId] })),
  ]);
}

/** Board surfaces (card menu, selection actions) share the requests, refresh and toasts. */
export function useLinkIssuesToPullRequest() {
  const queryClient = useQueryClient();
  const t = useTranslations("PullRequests");
  return useCallback(
    async (issueIds: readonly string[], pr: LinkTargetPullRequest) => {
      if (issueIds.length === 0) return;
      await queryClient.cancelQueries({ queryKey: ISSUE_PRS_PREFIX });
      queryClient.setQueriesData<IssuePrPayload>({ queryKey: ISSUE_PRS_PREFIX },
        (data) => optimisticIssuePrs(data, { link: pr, issueIds }));
      const outcome = await linkIssuesToPullRequest(issueIds, pr);
      await refreshPullRequestCaches(queryClient, [pr.prId], outcome.linked);
      if (outcome.linked.length > 0) {
        toast.success(t("linkedToPullRequest", { count: outcome.linked.length, number: pr.prNumber }));
      }
      if (outcome.failed.length > 0) {
        toast.error(t("linkToPullRequestFailed", {
          count: outcome.failed.length,
          reason: outcome.failed[0].message,
        }));
      }
    },
    [queryClient, t],
  );
}

/** Unlink the selection from all of its pull requests, optimistically. */
export function useUnlinkIssuesFromPullRequests() {
  const queryClient = useQueryClient();
  const t = useTranslations("PullRequests");
  return useCallback(
    async (links: ReadonlyArray<{ issueId: string; prIds: readonly string[] }>) => {
      const targets = links.filter((link) => link.prIds.length > 0);
      if (targets.length === 0) return;
      await queryClient.cancelQueries({ queryKey: ISSUE_PRS_PREFIX });
      queryClient.setQueriesData<IssuePrPayload>({ queryKey: ISSUE_PRS_PREFIX },
        (data) => optimisticIssuePrs(data, { unlinkIssueIds: targets.map((link) => link.issueId) }));
      const outcome = await unlinkIssuesFromPullRequests(targets);
      await refreshPullRequestCaches(
        queryClient,
        [...new Set(targets.flatMap((link) => link.prIds))],
        targets.map((link) => link.issueId),
      );
      if (outcome.linked.length > 0) {
        toast.success(t("unlinkedFromPullRequests", { count: outcome.linked.length }));
      }
      if (outcome.failed.length > 0) {
        toast.error(t("unlinkFromPullRequestsFailed", {
          count: outcome.failed.length,
          reason: outcome.failed[0].message,
        }));
      }
    },
    [queryClient, t],
  );
}
