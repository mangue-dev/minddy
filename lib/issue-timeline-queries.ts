import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fetchCommentsApi, fetchEventsApi } from "./comments-api";
import { applyCommentEdits } from "./optimistic/comment-edits";
import { reconcileCommentRead } from "./comment-delivery";
import type { Comment } from "./types";

export const commentsKey = (issueId: string) => ["comments", issueId] as const;

/** Reconcile on every timeline activation, including React Activity effect resume. */
export function issueCommentsOptions(client: QueryClient, issueId: string | null, active = true) {
  return queryOptions({
    queryKey: commentsKey(issueId ?? ""),
    queryFn: async ({ signal }) => {
      const startedAt = Date.now();
      const rows = await fetchCommentsApi(issueId as string, signal);
      return applyCommentEdits(client, issueId as string, reconcileCommentRead(
        rows, client.getQueryData<Comment[]>(commentsKey(issueId ?? "")),
      ), startedAt);
    },
    enabled: !!issueId && active,
    // A retained observer can be enabled again without mounting. Reopening must read.
    staleTime: 0,
    refetchOnMount: "always",
    // Streaming state transitions still poll if a realtime message is missed.
    refetchInterval: (query) => query.state.data?.some((comment) => comment.assistant_status === "working") ? 1500 : false,
  });
}

export function issueEventsOptions(issueId: string | null, active = true) {
  return queryOptions({
    queryKey: ["events", issueId ?? ""],
    queryFn: ({ signal }) => fetchEventsApi(issueId as string, signal),
    enabled: !!issueId && active,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
