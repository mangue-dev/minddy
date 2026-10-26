import type { Comment } from "@/lib/types";

/**
 * New comments an MCP agent has not answered yet (MIN-801).
 *
 * A ticket awaits its agent when an MCP agent commented on it and someone
 * commented after that agent's LAST comment: a teammate, the user themself,
 * or a forge comment mirrored from a linked pull request (MIN-802). Numo's
 * replies are not counted: they are another agent's voice, not new feedback.
 * A mirrored comment deleted on the forge no longer asks for anything.
 *
 * Mirrored comments carry their forge date in `created_at`, so one ordering
 * covers both sources. The SQL function `issue_comment_follow_ups` applies the
 * same rule for the board cards; keep the two in step.
 */
export interface CommentFollowUp {
  /** Comments written after the agent's last one. */
  count: number;
  /** When the agent last commented (ISO timestamp). */
  since: string;
}

type FollowUpComment = Pick<Comment, "created_at" | "via_mcp" | "via_assistant" | "github">;

export function commentFollowUp(comments: readonly FollowUpComment[]): CommentFollowUp | null {
  let sinceTime = -Infinity;
  for (const comment of comments) {
    if (comment.via_mcp) sinceTime = Math.max(sinceTime, Date.parse(comment.created_at));
  }
  if (sinceTime === -Infinity) return null;

  let count = 0;
  for (const comment of comments) {
    if (comment.via_mcp || comment.via_assistant || comment.github?.deleted_at) continue;
    if (Date.parse(comment.created_at) > sinceTime) count++;
  }
  // ISO, as the board's endpoint serves it, whatever form the row carried.
  return count > 0 ? { count, since: new Date(sinceTime).toISOString() } : null;
}
