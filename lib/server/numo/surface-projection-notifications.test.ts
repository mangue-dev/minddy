// A question Numo asks after an @Numo mention is posted as the requester's own
// comment, so the usual comment notification skips them (MIN-1028). These
// checks keep the requester informed that Numo is waiting for their answer.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { commentProjectionNotificationRows } = await import("./surface-projection");

const base = {
  projectId: "project",
  actorId: "requester",
  responseId: "reply",
  table: "comments" as const,
  notification: {
    type: "comment" as const,
    candidateUserIds: ["requester", "assignee", "outsider", null],
    issueId: "issue",
  },
  memberIds: new Set(["requester", "assignee"]),
};

describe("Numo shared-thread reply notifications", () => {
  it("notifies the other members of a finished reply, never the requester", () => {
    const rows = commentProjectionNotificationRows({ ...base, turnStatus: "completed" });
    expect(rows.map((row) => [row.user_id, row.type])).toEqual([["assignee", "comment"]]);
  });

  it("tells the requester in their inbox when the reply is a question", () => {
    const rows = commentProjectionNotificationRows({ ...base, turnStatus: "waiting_input" });
    expect(rows.map((row) => [row.user_id, row.type])).toEqual([
      ["assignee", "comment"],
      ["requester", "agent_question"],
    ]);
    expect(rows[1]).toMatchObject({
      project_id: "project",
      issue_id: "issue",
      comment_id: "reply",
      actor_id: null,
      via_assistant: true,
    });
  });

  it("points a page question at the page without a comments-table excerpt", () => {
    const rows = commentProjectionNotificationRows({
      ...base,
      table: "page_comments",
      notification: {
        type: "page_comment",
        candidateUserIds: [],
        pageId: "page",
        blockId: "block",
      },
      turnStatus: "waiting_input",
    });
    expect(rows).toEqual([
      expect.objectContaining({
        user_id: "requester",
        type: "agent_question",
        page_id: "page",
        block_id: "block",
        comment_id: undefined,
      }),
    ]);
  });

  it("does not notify a requester who is no longer a member", () => {
    const rows = commentProjectionNotificationRows({
      ...base,
      memberIds: new Set(["assignee"]),
      turnStatus: "waiting_input",
    });
    expect(rows.map((row) => row.user_id)).toEqual(["assignee"]);
  });
});
