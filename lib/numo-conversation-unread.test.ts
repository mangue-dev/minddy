import { describe, expect, it } from "vitest";
import { isNumoConversationUnread } from "./numo-conversation-unread";

const conversation = {
  id: "conversation-1",
  status: "idle" as const,
  last_answer_at: "2026-09-13T12:00:00.000Z",
  last_read_at: "2026-09-13T11:00:00.000Z",
};

describe("isNumoConversationUnread", () => {
  it("marks a conversation unread when Numo answered after the last read", () => {
    expect(isNumoConversationUnread(conversation, null)).toBe(true);
  });

  it("does not duplicate the active or generating indicators", () => {
    expect(isNumoConversationUnread(conversation, conversation.id)).toBe(false);
    expect(isNumoConversationUnread({ ...conversation, status: "generating" }, null)).toBe(false);
  });

  it("stays read when the read timestamp is newer than the latest answer", () => {
    expect(isNumoConversationUnread({
      ...conversation,
      last_read_at: "2026-09-13T13:00:00.000Z",
    }, null)).toBe(false);
  });

  it("ignores row updates that are not answers", () => {
    // A read answer, then a title, a stop or a maintenance stamp moving updated_at.
    const updated = {
      ...conversation,
      last_read_at: "2026-09-13T12:00:05.000Z",
      updated_at: "2026-10-27T09:00:00.000Z",
    };
    expect(isNumoConversationUnread(updated, null)).toBe(false);
  });

  it("is never unread without an answer", () => {
    expect(isNumoConversationUnread({
      ...conversation,
      last_answer_at: null,
      last_read_at: null,
    }, null)).toBe(false);
  });

  it("is unread when an answer was never read", () => {
    expect(isNumoConversationUnread({ ...conversation, last_read_at: null }, null)).toBe(true);
  });
});
