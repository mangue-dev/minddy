"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { ALL_PULL_REQUESTS_QUERY_KEY } from "./pull-request-list-cache";
import { linkPullRequestIssueApi } from "./agent-api";

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
  const results = await Promise.allSettled(
    issueIds.map((issueId) => link(pr.prId, issueId, pr.state)),
  );
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

/** Board surfaces (card menu, selection actions) share the requests, refresh and toasts. */
export function useLinkIssuesToPullRequest() {
  const queryClient = useQueryClient();
  const t = useTranslations("PullRequests");
  return useCallback(
    async (issueIds: readonly string[], pr: LinkTargetPullRequest) => {
      if (issueIds.length === 0) return;
      const outcome = await linkIssuesToPullRequest(issueIds, pr);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ALL_PULL_REQUESTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["pull-request", pr.prId] }),
        queryClient.invalidateQueries({ queryKey: ["issue-pull-requests"] }),
        ...outcome.linked.map((issueId) =>
          queryClient.invalidateQueries({ queryKey: ["issue-pull-request", issueId] })),
      ]);
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
