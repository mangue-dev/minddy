import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { fetchCommentsApi, fetchEventsApi } from "./comments-api";
import { reconcileCommentRead } from "./comment-delivery";
import type { Comment } from "./types";

export const commentsKey = (issueId: string) => ["comments", issueId] as const;

/** Reconcile on every timeline activation, including React Activity effect resume. */
export function issueCommentsOptions(client: QueryClient, issueId: string | null) {
  return queryOptions({
    queryKey: commentsKey(issueId ?? ""),
    queryFn: async () => reconcileCommentRead(
      await fetchCommentsApi(issueId as string),
      client.getQueryData<Comment[]>(commentsKey(issueId ?? "")),
    ),
    enabled: !!issueId,
    refetchOnMount: "always",
    // Streaming state transitions still poll if a realtime message is missed.
    refetchInterval: (query) => query.state.data?.some((comment) => comment.assistant_status === "working") ? 1500 : false,
  });
}

export function issueEventsOptions(issueId: string | null) {
  return queryOptions({
    queryKey: ["events", issueId ?? ""],
    queryFn: () => fetchEventsApi(issueId as string),
    enabled: !!issueId,
    refetchOnMount: "always",
  });
}
