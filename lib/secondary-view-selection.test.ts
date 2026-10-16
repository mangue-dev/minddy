import { describe, expect, it } from "vitest";
import { feedbackSelectionItems, matchesObjectiveState, secondarySelectionId, triageSelectionItems } from "./secondary-view-selection";
import type { Issue, Objective } from "./types";
import type { TeamFeedbackListItem } from "./server/feedback/team-queries";

const issue = (id: string, created_at: string, status = "triage") => ({ id, created_at, status } as Issue);
// Selection fixtures omit unrelated detail and author payloads.
const post = (id: string, vote_count: number, created_at: string,
  status: TeamFeedbackListItem["status"] = "open", review_state: TeamFeedbackListItem["review_state"] = "published") =>
  ({ id, project_id: "project", vote_count, created_at, status, review_state, sensitivity: null, category_ids: [] } as unknown as TeamFeedbackListItem);

describe("shared secondary detail selection", () => {
  it("selects the newest triage issue without letting column filters change the detail", () => {
    const rows = triageSelectionItems([issue("old", "2026-01-01"), issue("new", "2026-01-02"), issue("board", "2026-01-03", "backlog")]);
    expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
    expect(secondarySelectionId(rows)).toBe("new");
    expect(secondarySelectionId(rows, null, "old")).toBe("old");
    expect(secondarySelectionId(rows, "missing")).toBe("new");
  });

  it("uses the feedback state, review and sort controls while valid explicit links win", () => {
    const rows = [post("old", 9, "2026-01-01"), post("new", 9, "2026-01-02"), post("archive", 20, "2026-01-03", "shipped"), post("review", 2, "2026-01-04", "open", "pending")];
    expect(secondarySelectionId(feedbackSelectionItems(rows))).toBe("new");
    expect(secondarySelectionId(feedbackSelectionItems(rows, { sort: "oldest" }))).toBe("old");
    expect(secondarySelectionId(feedbackSelectionItems(rows, { onlyToReview: true }))).toBe("review");
    expect(secondarySelectionId(feedbackSelectionItems(rows), "archive", null, rows)).toBe("archive");
    expect(secondarySelectionId(feedbackSelectionItems(rows, { state: "all" }))).toBe("archive");
  });

  it("preserves ordinary objective order and allows an explicit completed objective", () => {
    const rows = [{ id: "done", status: "done" }, { id: "planned", status: "planned" }, { id: "active", status: "in_progress" }] as Objective[];
    const visible = rows.filter((row) => matchesObjectiveState(row, "active"));
    expect(secondarySelectionId(visible)).toBe("planned");
    expect(secondarySelectionId(visible, "done", null, rows)).toBe("done");
    expect(secondarySelectionId([], "unavailable", null, rows)).toBeNull();
  });
});
