"use client";

// Pending writes of feedback posts (MIN-156's register, for the Feedback
// destination). A row menu writes a post's status, objective, categories or
// visibility in place: the caches show it at once, and a list or detail
// response that left before the write was confirmed goes through this
// register, so it can no longer bring the old value back for a moment.

import type { QueryClient } from "@tanstack/react-query";
import { createPendingWrites } from "./pending-writes";
import type { TeamFeedbackDetail, TeamFeedbackListItem } from "../server/feedback/team-queries";

export const feedbackWrites = createPendingWrites<TeamFeedbackListItem>();

/** Overlays the writes still pending on a detail response. */
export function applyFeedbackWritesToPost<T extends TeamFeedbackDetail>(post: T, fetchStartedAt: number): T {
  const [patched] = feedbackWrites.apply([post as unknown as TeamFeedbackListItem], fetchStartedAt);
  return patched === (post as unknown) ? post : { ...post, ...patched };
}

function patchCaches(queryClient: QueryClient, projectId: string, postId: string, patch: Partial<TeamFeedbackListItem>) {
  queryClient.setQueriesData<{ posts: TeamFeedbackListItem[] }>(
    { queryKey: ["feedback", projectId] },
    (data) => data && {
      ...data,
      posts: data.posts.map((post) => (post.id === postId ? { ...post, ...patch } : post)),
    },
  );
  queryClient.setQueryData<{ post: TeamFeedbackDetail }>(
    ["feedback-detail", projectId, postId],
    (data) => data && { ...data, post: { ...data.post, ...patch } },
  );
}

/**
 * Writes `patch` to a post optimistically: every cache shows it now, `send`
 * runs the request, and the refetch that follows starts after the server
 * confirmed it. A refused write is forgotten and the caches reload.
 */
export async function writeFeedbackPost(
  queryClient: QueryClient,
  projectId: string,
  postId: string,
  patch: Partial<TeamFeedbackListItem>,
  send: () => Promise<unknown>,
): Promise<void> {
  const handle = feedbackWrites.begin({ kind: "patch", id: postId, patch });
  patchCaches(queryClient, projectId, postId, patch);
  try {
    await send();
    feedbackWrites.settle(handle);
  } catch (error) {
    feedbackWrites.fail(handle);
    throw error;
  } finally {
    // Filters, counts and the objective's feedback row follow the write.
    void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId, postId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-count", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["objective-feedback", projectId] });
  }
}
