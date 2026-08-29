import { describe, expect, it } from "vitest";
import { buildInboxToolResult } from "./inbox-tool";
import type { MyNotification } from "./types";

function notification(
  overrides: Partial<MyNotification> & Pick<MyNotification, "id" | "type">,
): MyNotification {
  const { id, type, ...rest } = overrides;
  return {
    id,
    type,
    read_at: null,
    created_at: "2026-08-29T10:00:00.000Z",
    issue_id: null,
    agent_conversation_id: null,
    agent_conversation_title: null,
    issue_number: null,
    issue_title: null,
    objective_id: null,
    objective_name: null,
    feedback_post_id: null,
    feedback_title: null,
    routine_id: null,
    routine_title: null,
    pull_request_id: null,
    pull_request_number: null,
    pull_request_title: null,
    page_id: null,
    page_title: null,
    block_id: null,
    project_id: null,
    project_key: null,
    actor_name: null,
    actor_avatar_seed: null,
    from_numo: false,
    via_mcp: false,
    api_key_agent: null,
    api_key_name: null,
    via_smart_assign: false,
    via_automation: false,
    comment_excerpt: null,
    ...rest,
  };
}

const rows = [
  notification({
    id: "unread-mention",
    type: "mention",
    issue_id: "issue-1",
    issue_number: 42,
    issue_title: "Fix authentication",
    project_id: "project-1",
    project_key: "MIND",
    actor_name: "Ada",
  }),
  notification({
    id: "read-comment",
    type: "comment",
    read_at: "2026-08-29T11:00:00.000Z",
    page_id: "page-1",
    page_title: "Release notes",
  }),
];

describe("buildInboxToolResult", () => {
  it("returns unread notifications by default with resolvable targets", () => {
    const result = buildInboxToolResult(rows);
    expect(result.unread_count).toBe(1);
    expect(result.notifications).toEqual([
      expect.objectContaining({
        id: "unread-mention",
        unread: true,
        target: expect.objectContaining({
          kind: "issue",
          id: "issue-1",
          identifier: "MIND-42",
        }),
      }),
    ]);
  });

  it("filters read rows and searches hydrated titles", () => {
    const result = buildInboxToolResult(rows, {
      state: "read",
      query: "release",
    });
    expect(result.notifications.map((item) => item.id)).toEqual([
      "read-comment",
    ]);
  });

  it("limits the mentions category to issue and page mentions", () => {
    const result = buildInboxToolResult(rows, {
      state: "all",
      category: "mentions",
    });
    expect(result.notifications.map((item) => item.id)).toEqual([
      "unread-mention",
    ]);
  });
});
