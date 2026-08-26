import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import {
  mergeIssueSnapshot,
  reconcileGlobalIssueSnapshot,
  reconcileProjectIssuesInGlobalCache,
} from "./global-issues-api";
import type { GlobalBoardResponse, Issue } from "./types";

const issue = (
  id: string,
  projectId: string,
  status: Issue["status"],
  position: number
): Issue =>
  ({
    id,
    project_id: projectId,
    number: 1,
    title: id,
    description: null,
    plan: null,
    status,
    priority: "none",
    effort: null,
    assignee_id: null,
    objective_id: null,
    parent_id: null,
    duplicate_of_id: null,
    due_date: null,
    recurrence: null,
    recurrence_series_id: null,
    position,
    created_by: null,
    created_at: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-26T12:00:00.000Z",
    completed_at: null,
    cycle_id: null,
    category_ids: [],
  }) satisfies Issue;

const board = (issues: Issue[]): GlobalBoardResponse => ({
  issues,
  members: {},
  categories: {},
  objectives: {},
  integrations: {},
  relations: [],
  cycles: { enabled: false, current: null, upcoming: [], past: [] },
});

describe("mergeIssueSnapshot", () => {
  it("reorders, adds, removes, and preserves client-only fields", () => {
    const stale = issue("a", "p1", "todo", 1);
    stale.resource_count = 3;
    const fresh = issue("a", "p1", "in_progress", 20);
    const added = issue("b", "p1", "todo", 30);

    expect(mergeIssueSnapshot([stale, issue("gone", "p1", "todo", 2)], [
      added,
      fresh,
    ])).toEqual([added, { ...fresh, resource_count: 3 }]);
  });

  it("does not overwrite a row changed after the snapshot read", () => {
    const cached = issue("a", "p1", "done", 40);
    cached.updated_at = "2026-08-26T12:00:02.000Z";
    const snapshot = issue("a", "p1", "todo", 1);

    expect(mergeIssueSnapshot([cached], [snapshot], Date.parse(
      "2026-08-26T12:00:01.000Z"
    ))).toEqual([cached]);
  });

  it("keeps a concurrent insertion that the snapshot could not contain", () => {
    const inserted = issue("new", "p1", "todo", 10);
    inserted.updated_at = "2026-08-26T12:00:02.000Z";

    expect(
      mergeIssueSnapshot(
        [inserted],
        [],
        Date.parse("2026-08-26T12:00:01.000Z")
      )
    ).toEqual([inserted]);
  });
});

describe("Kanban cache reconciliation", () => {
  it("propagates a project refetch into the inactive global cache", () => {
    const client = new QueryClient();
    client.setQueryData(
      GLOBAL_BOARD_KEY,
      board([issue("a", "p1", "todo", 1), issue("z", "p2", "todo", 1)])
    );

    reconcileProjectIssuesInGlobalCache(client, "p1", [
      issue("a", "p1", "in_progress", 20),
    ]);

    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues).toEqual([
      issue("z", "p2", "todo", 1),
      issue("a", "p1", "in_progress", 20),
    ]);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });

  it("repairs global and loaded project caches from one snapshot", () => {
    const client = new QueryClient();
    client.setQueryData(
      GLOBAL_BOARD_KEY,
      board([issue("a", "p1", "todo", 1), issue("deleted", "p2", "todo", 1)])
    );
    client.setQueryData(["issues", "p1"], [issue("a", "p1", "todo", 1)]);
    client.setQueryData(["issues", "p2"], [issue("deleted", "p2", "todo", 1)]);
    const snapshot = [issue("a", "p1", "done", 40), issue("new", "p1", "todo", 50)];

    reconcileGlobalIssueSnapshot(client, {
      issues: snapshot,
      startedAt: Date.parse("2026-08-26T12:00:01.000Z"),
    });

    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues).toEqual(
      snapshot
    );
    expect(client.getQueryData(["issues", "p1"])).toEqual(snapshot);
    expect(client.getQueryData(["issues", "p2"])).toEqual([]);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });
});
