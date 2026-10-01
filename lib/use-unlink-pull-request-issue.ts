"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { ALL_PULL_REQUESTS_QUERY_KEY } from "./pull-request-list-cache";
import { unlinkPullRequestIssueApi } from "./agent-api";

/** Both unlink surfaces refresh the PR list, issue activity, and open issue panel. */
export function useUnlinkPullRequestIssue() {
  const queryClient = useQueryClient();
  const t = useTranslations("PullRequests");
  return useMutation({
    mutationFn: ({ prId, issueId }: { prId: string; issueId: string; identifier: string }) =>
      unlinkPullRequestIssueApi(prId, issueId),
    onSuccess: async (_, { prId, issueId, identifier }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ALL_PULL_REQUESTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["pull-request", prId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-active-issues"] }),
        queryClient.invalidateQueries({ queryKey: ["agent-runs", "issue", issueId] }),
      ]);
      toast.success(t("unlinkIssueDone", { identifier }));
    },
    onError: (error) => toast.error(error.message),
  });
}
