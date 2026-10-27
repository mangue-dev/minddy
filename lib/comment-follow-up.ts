import type { Comment } from "@/lib/types";

/**
 * New comments an MCP agent has not answered yet (MIN-801, MIN-818).
 *
 * The rule works per thread (a root comment and its replies, depth ≤ 1):
 *
 * - A reply in a thread the agent took part in (it wrote the root or one of
 *   the replies) waits until the agent writes in THAT thread after it,
 *   whatever the agent posted elsewhere on the ticket.
 * - Any other comment (a root comment, or a reply in a thread the agent never
 *   joined) waits when it came after the agent's LAST comment on the ticket.
 *
 * Authors are teammates, the user themself, or a forge comment mirrored from
 * a linked pull request (MIN-802). Numo's replies are not counted: they are
 * another agent's voice, not new feedback. A mirrored comment deleted on the
 * forge no longer asks for anything.
 *
 * Mirrored comments carry their forge date in `created_at`, so one ordering
 * covers both sources. The SQL function `issue_comment_follow_ups` applies the
 * same rule for the board cards; keep the two in step.
 */
export interface CommentFollowUp {
  /** Comments still waiting for the agent. */
  count: number;
  /** When the agent last commented on the ticket (ISO timestamp). */
  since: string;
  /** Root comment ids of the agent's threads holding unanswered replies. */
  threads: string[];
}

type FollowUpComment = Pick<
  Comment,
  "id" | "parent_id" | "created_at" | "via_mcp" | "via_assistant" | "github"
>;

export function commentFollowUp(comments: readonly FollowUpComment[]): CommentFollowUp | null {
  let sinceTime = -Infinity;
  // The agent's last message in each thread, keyed by the thread's root id.
  const threadAgentTime = new Map<string, number>();
  for (const comment of comments) {
    if (!comment.via_mcp) continue;
    const time = Date.parse(comment.created_at);
    const thread = comment.parent_id ?? comment.id;
    sinceTime = Math.max(sinceTime, time);
    threadAgentTime.set(thread, Math.max(threadAgentTime.get(thread) ?? -Infinity, time));
  }
  if (sinceTime === -Infinity) return null;

  let count = 0;
  const threads = new Set<string>();
  for (const comment of comments) {
    if (comment.via_mcp || comment.via_assistant || comment.github?.deleted_at) continue;
    const time = Date.parse(comment.created_at);
    const thread = comment.parent_id;
    const threadTime = thread ? threadAgentTime.get(thread) : undefined;
    if (thread && threadTime !== undefined) {
      if (time > threadTime) {
        count++;
        threads.add(thread);
      }
    } else if (time > sinceTime) {
      count++;
    }
  }
  // ISO, as the board's endpoint serves it, whatever form the row carried.
  return count > 0
    ? { count, since: new Date(sinceTime).toISOString(), threads: [...threads] }
    : null;
}
