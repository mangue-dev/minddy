import { queryOptions } from "@tanstack/react-query";
import { fetchFeedbackCommentsApi, fetchFeedbackEventsApi, fetchObjectiveCommentsApi, fetchObjectiveEventsApi } from "./comments-api";
import type { Attachment } from "./types";
import type { TeamFeedbackDetail } from "./server/feedback/team-queries";

async function read<T>(path: string, signal?: AbortSignal, fallback = "error"): Promise<T> {
  const response = await fetch(path, { signal, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || fallback);
  return data as T;
}

export const feedbackDetailOptions = (projectId: string, postId: string) => queryOptions({
  queryKey: ["feedback-detail", projectId, postId] as const,
  queryFn: ({ signal }) => read<{ post: TeamFeedbackDetail }>(`/api/projects/${projectId}/feedback/${postId}`, signal),
});
export const feedbackCommentsOptions = (projectId: string, postId: string) => queryOptions({
  queryKey: ["feedback-comments", projectId, postId] as const,
  queryFn: ({ signal }) => fetchFeedbackCommentsApi(projectId, postId, signal),
  refetchInterval: (query) => query.state.data?.some((comment) => comment.assistant_status === "working") ? 1500 : false,
});
export const feedbackEventsOptions = (projectId: string, postId: string) => queryOptions({
  queryKey: ["feedback-events", projectId, postId] as const,
  queryFn: ({ signal }) => fetchFeedbackEventsApi(projectId, postId, signal),
});
export const objectiveCommentsOptions = (objectiveId: string) => queryOptions({
  queryKey: ["objective-comments", objectiveId] as const,
  queryFn: ({ signal }) => fetchObjectiveCommentsApi(objectiveId, signal),
  refetchInterval: (query) => query.state.data?.some((comment) => comment.assistant_status === "working") ? 1500 : false,
});
export const objectiveEventsOptions = (objectiveId: string) => queryOptions({
  queryKey: ["objective-events", objectiveId] as const,
  queryFn: ({ signal }) => fetchObjectiveEventsApi(objectiveId, signal),
});
export const objectiveResourcesOptions = (objectiveId: string) => queryOptions({
  queryKey: ["objective-resources", objectiveId] as const,
  queryFn: async ({ signal }) => await read<Attachment[] | null>(`/api/objectives/${objectiveId}/resources`, signal, "Request failed") ?? [],
});
export const objectiveFeedbackCountOptions = (projectId: string, objectiveId: string) => queryOptions({
  queryKey: ["objective-feedback", projectId, objectiveId, "count"] as const,
  queryFn: async ({ signal }): Promise<{ count: number }> => {
    const response = await fetch(`/api/objectives/${objectiveId}/feedback?count=1`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Unable to load objective feedback");
    return response.json();
  },
});
