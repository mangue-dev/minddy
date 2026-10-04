import { describe, expect, it } from "vitest";
import { keysForProjectEvent, type BroadcastChange } from "./realtime-keys";

const project = "project-1";
const metadata = { id: null, project_id: null, issue_id: null, objective_id: null, feedback_post_id: null, page_id: null, parent_id: null };
const change = (table: string, old: Record<string, unknown>): BroadcastChange => ({
  table, operation: "DELETE", schema: "public", record: metadata, old_record: old,
});

describe("encrypted comment deletion metadata", () => {
  it.each([
    ["issue_id", "issue-1", ["comments", "issue-1"]],
    ["objective_id", "objective-1", ["objective-comments", "objective-1"]],
    ["feedback_post_id", "post-1", ["feedback-comments", project, "post-1"]],
  ])("refreshes the original %s parent when NEW is an all-null record", (field, id, key) => {
    const old = { ...metadata, id: "comment-1", project_id: project, [field]: id };
    expect(keysForProjectEvent(change("comments", old), project)).toContainEqual({ key, refetch: "active" });
  });

  it("refreshes a deleted page comment without broadcasting private content", () => {
    expect(keysForProjectEvent(change("page_comments", { ...metadata, page_id: "page-1" }), project))
      .toContainEqual({ key: ["page-comments", "page-1"], refetch: "active" });
  });

  it("uses the current parent for INSERT and UPDATE", () => {
    for (const operation of ["INSERT", "UPDATE"] as const) {
      const event = { ...change("comments", { issue_id: "old-issue" }), operation, record: { issue_id: "current-issue" } };
      expect(keysForProjectEvent(event, project)).toEqual([{ key: ["comments", "current-issue"], refetch: "active" }]);
    }
  });
});
