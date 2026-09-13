import type { NumoConversation } from "./assistant-types";

/** Worker updates make the parent conversation unread once it is no longer open or generating. */
export function isNumoConversationUnread(
  conversation: Pick<NumoConversation, "id" | "status" | "updated_at" | "last_read_at">,
  activeConversationId: string | null,
): boolean {
  if (conversation.id === activeConversationId || conversation.status === "generating") {
    return false;
  }
  if (!conversation.last_read_at) return true;
  return (
    new Date(conversation.updated_at).getTime() >
    new Date(conversation.last_read_at).getTime()
  );
}
