import type { NumoConversation } from "./assistant-types";

/**
 * A conversation is unread when Numo answered after the user last read it.
 * The row's `updated_at` is no signal: the user's own messages, a stop, the
 * generated title and background maintenance all move it (MIN-812).
 */
export function isNumoConversationUnread(
  conversation: Pick<NumoConversation, "id" | "status" | "last_answer_at" | "last_read_at">,
  activeConversationId: string | null,
): boolean {
  if (conversation.id === activeConversationId || conversation.status === "generating") {
    return false;
  }
  if (!conversation.last_answer_at) return false;
  if (!conversation.last_read_at) return true;
  return (
    new Date(conversation.last_answer_at).getTime() >
    new Date(conversation.last_read_at).getTime()
  );
}
