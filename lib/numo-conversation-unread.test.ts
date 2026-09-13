import { describe, expect, it } from "vitest";
import { isNumoConversationUnread } from "./numo-conversation-unread";

const conversation = {
  id: "conversation-1",
  status: "idle" as const,
  updated_at: "2026-09-13T12:00:00.000Z",
  last_read_at: "2026-09-13T11:00:00.000Z",
};

describe("isNumoConversationUnread", () => {
  it("marks a parent conversation unread after persisted worker activity", () => {
    expect(isNumoConversationUnread(conversation, null)).toBe(true);
  });

  it("does not duplicate the active or generating indicators", () => {
    expect(isNumoConversationUnread(conversation, conversation.id)).toBe(false);
    expect(isNumoConversationUnread({ ...conversation, status: "generating" }, null)).toBe(false);
  });

  it("stays read when the read timestamp is newer", () => {
    expect(isNumoConversationUnread({
      ...conversation,
      last_read_at: "2026-09-13T13:00:00.000Z",
    }, null)).toBe(false);
  });
});
