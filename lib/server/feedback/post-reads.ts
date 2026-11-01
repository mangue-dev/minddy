import "server-only";
import { commentStore } from "@/lib/server/comment-store";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { readIssueEvents } from "@/lib/server/issue-event-store";
import { getServiceClient } from "@/lib/supabase-service";
import { feedbackSelectionItems } from "@/lib/secondary-view-selection";
import type { FeedbackSelectionHint } from "@/lib/feedback-selection-hint";
import { getTeamFeedbackDetail, type TeamFeedbackDetail, type TeamFeedbackListItem } from "./team-queries";

/**
 * The internal comments and activity of one feedback post, as the team reads
 * them. Service-role reads: the caller has settled membership and that the
 * post belongs to the project (requireFeedbackMember with the post id, or a
 * post taken from this project's own list).
 */
export async function readFeedbackComments(postId: string, userId: string) {
  const { data, error } = await commentStore(getServiceClient(), "comments", userId)
    .select("*, attachments(*), feedback_users!feedback_user_id (id, name, email, pseudonym)")
    .eq("feedback_post_id", postId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  const keyActors = await resolveApiKeyActors((data ?? []).map((c) => c.api_key_id as string | null));
  return {
    data: (data ?? []).map((comment) => ({
      ...comment,
      api_key_name: keyActors.get(comment.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(comment.api_key_id as string)?.agent ?? null,
    })),
    error: null,
  };
}

export async function readFeedbackEvents(projectId: string, postId: string, userId: string) {
  const { data, error } = await readIssueEvents(getServiceClient(), { feedback_post_id: postId },
    { projectId, actorId: userId, integrations: true });
  if (error) return { data: null, error };
  // MCP Actions: Resolve key (name + agent) via customer service.
  const keyActors = await resolveApiKeyActors((data ?? []).map((e) => e.api_key_id as string | null));
  return {
    data: (data ?? []).map(({ integration, ...event }) => ({
      ...event,
      integration_name: (integration as { name: string } | null)?.name ?? null,
      api_key_name: keyActors.get(event.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(event.api_key_id as string)?.agent ?? null,
    })),
    error: null,
  };
}

export interface PreparedFeedbackPost {
  postId: string;
  post: TeamFeedbackDetail;
  comments: unknown[];
  events: unknown[];
}

/**
 * The post the team page opens on this list, read with it (MIN-875). The page
 * selects its first visible post, or the one a link names, only once the list
 * arrives: its detail, comments and activity used to leave one round trip
 * after the list. `posts` is this project's own list, so the chosen post
 * belongs to the project the caller is a member of. Any failed read returns
 * nothing: the page then reads the post itself.
 */
export async function prepareFeedbackPost(projectId: string, userId: string,
  posts: readonly TeamFeedbackListItem[], hint: FeedbackSelectionHint): Promise<PreparedFeedbackPost | null> {
  const requested = hint.post ? posts.find((post) => post.id === hint.post) : undefined;
  const postId = requested?.id ?? feedbackSelectionItems(posts, hint)[0]?.id;
  if (!postId) return null;
  try {
    const [post, comments, events] = await Promise.all([
      getTeamFeedbackDetail(projectId, postId),
      readFeedbackComments(postId, userId),
      readFeedbackEvents(projectId, postId, userId),
    ]);
    if (!post || !comments.data || !events.data) return null;
    return { postId, post, comments: comments.data, events: events.data };
  } catch {
    return null;
  }
}
