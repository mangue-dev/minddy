export type CommentLiveTable = "comments" | "page_comments";

const COMMENT_LIVE_TOPIC_PREFIX: Record<CommentLiveTable, string> = {
  comments: "numo-comment",
  page_comments: "numo-page-comment",
};

/** Keep independent tables in independent private Realtime namespaces. */
export function numoCommentTopic(
  commentId: string,
  table: CommentLiveTable = "comments",
): string {
  return `${COMMENT_LIVE_TOPIC_PREFIX[table]}:${commentId}`;
}
