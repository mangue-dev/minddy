import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_BOARD_KEY, insertIssueEverywhere, issueWrites, patchIssueEverywhere, removeIssueEverywhere } from "./optimistic/issue-writes";
import {
  mergeIssueSnapshot,
  reconcileGlobalIssueSnapshot,
  reconcileProjectIssuesInGlobalCache,
  shouldRefreshGlobalIssueSnapshot,
  refreshGlobalIssueSnapshot,
  GLOBAL_ISSUES_KEY,
} from "./global-issues-api";
import { globalBoardQueryFn } from "./global-board-api";
import { objectiveProgress } from "./use-objectives-query";
import type { GlobalBoardResponse, Issue } from "./types";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); issueWrites.reset(); });

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
  it.each([1206, 1440])("retains all %i authorized snapshot rows and every late objective task through the real query owner", async (size) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other = new QueryClient();
    const project = Array.from({ length: 670 }, (_, index) => ({ ...issue(`project-${index}`, "p1", index >= 655 ? "done" : "todo", index),
      objective_id: index >= 655 ? "last-goal" : null, resource_count: index % 4 }));
    const neighbors = Array.from({ length: size - project.length }, (_, index) => issue(`neighbor-${index}`, "p2", "todo", index));
    // The historical capped response lost the tail of this project after other projects' rows.
    const complete = [...neighbors, ...project].map(({ resource_count: _count, ...row }) => row as Issue);
    client.setQueryData(GLOBAL_BOARD_KEY, board([...neighbors, ...project]));
    client.setQueryData(["issues", "p1"], project);
    client.setQueryData(["issues", "p2"], neighbors);
    const accountSentinel = [issue("other-account", "p1", "todo", 0)];
    other.setQueryData(["issues", "p1"], accountSentinel);
    const fetch = vi.fn(async (path: string) => {
      expect(path).toBe("/api/me/issues"); return Response.json(complete);
    }); vi.stubGlobal("fetch", fetch);
    try {
      const snapshot = await refreshGlobalIssueSnapshot(client);
      expect(snapshot.issues).toHaveLength(size);
      expect(client.getQueryState(GLOBAL_ISSUES_KEY)?.status).toBe("success");
      const global = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
      const scoped = client.getQueryData<Issue[]>(["issues", "p1"])!;
      expect(global).toHaveLength(size); expect(scoped).toHaveLength(670);
      expect(new Set(global.map((row) => row.id))).toEqual(new Set(complete.map((row) => row.id)));
      expect(new Set(scoped.map((row) => row.id))).toEqual(new Set(project.map((row) => row.id)));
      expect(scoped.map((row) => row.resource_count)).toEqual(project.map((row) => row.resource_count));
      expect(global.filter((row) => row.project_id === "p1").map((row) => row.resource_count)).toEqual(project.map((row) => row.resource_count));
      expect(objectiveProgress("last-goal", scoped)).toEqual({ done: 15, total: 15, percent: 100 });
      expect(scoped.filter((row) => row.objective_id === "last-goal").map((row) => row.id)).toEqual(project.slice(-15).map((row) => row.id));
      expect(client.getQueryState(["issues", "p1"])?.isInvalidated).toBe(false);
      expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
      expect(other.getQueryData(["issues", "p1"])).toBe(accountSentinel);
      expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]?.[0]).toBe("/api/me/issues");
    } finally { client.clear(); other.clear(); }
  });

  it("keeps newer rows, concurrent insertions and pending edits while removing deleted and revoked slices", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const editable = { ...issue("edited", "p1", "todo", 1), resource_count: 3 };
    const newer = issue("newer", "p1", "todo", 2);
    const deleted = issue("deleted", "p1", "todo", 3);
    const removing = issue("removing", "p1", "todo", 7);
    const revoked = issue("revoked", "revoked-project", "todo", 4);
    client.setQueryData(GLOBAL_BOARD_KEY, board([editable, newer, deleted, removing, revoked]));
    client.setQueryData(["issues", "p1"], [editable, newer, deleted, removing]);
    client.setQueryData(["issues", "revoked-project"], [revoked]);
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    try {
      const refresh = refreshGlobalIssueSnapshot(client);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      const updatedAt = new Date(Date.now() + 1000).toISOString();
      patchIssueEverywhere(client, "p1", "newer", { status: "done", updated_at: updatedAt });
      const concurrent = { ...issue("concurrent", "p1", "in_progress", 5), updated_at: updatedAt };
      insertIssueEverywhere(client, "p1", concurrent);
      const pending = { ...issue("pending", "p1", "todo", 6), updated_at: updatedAt };
      issueWrites.begin({ kind: "insert", row: pending }); insertIssueEverywhere(client, "p1", pending);
      issueWrites.begin({ kind: "patch", id: editable.id, patch: { status: "in_review" } });
      patchIssueEverywhere(client, "p1", editable.id, { status: "in_review" });
      issueWrites.begin({ kind: "remove", id: removing.id }); removeIssueEverywhere(client, "p1", removing.id);
      finish(Response.json([issue(editable.id, "p1", "todo", 1), newer, removing]));
      await refresh;
      const scoped = client.getQueryData<Issue[]>(["issues", "p1"])!;
      expect(new Set(scoped.map((row) => row.id))).toEqual(new Set(["edited", "newer", "concurrent", "pending"]));
      expect(scoped.find((row) => row.id === "edited")).toMatchObject({ status: "in_review", resource_count: 3 });
      expect(scoped.find((row) => row.id === "newer")).toMatchObject({ status: "done", updated_at: updatedAt });
      expect(scoped.find((row) => row.id === "concurrent")).toEqual(concurrent);
      expect(scoped.find((row) => row.id === "pending")).toEqual(pending);
      expect(client.getQueryData(["issues", "revoked-project"])).toEqual([]);
      expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues).toEqual(scoped);
      expect(client.getQueryData(["issues", "never-loaded"])).toBeUndefined();
    } finally { client.clear(); }
  });

  it.each([403, 500])("does not reconcile or delete prior rows when the authoritative endpoint fails with %i", async (status) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rows = [issue("retained", "p1", "todo", 1)], prior = board(rows);
    client.setQueryData(GLOBAL_BOARD_KEY, prior); client.setQueryData(["issues", "p1"], rows);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Read failed" }, { status })));
    try {
      await expect(refreshGlobalIssueSnapshot(client)).rejects.toThrow("Read failed");
      expect(client.getQueryData(GLOBAL_BOARD_KEY)).toBe(prior);
      expect(client.getQueryData(["issues", "p1"])).toBe(rows);
      expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(false);
      expect(client.getQueryState(GLOBAL_ISSUES_KEY)?.status).toBe("error");
    } finally { client.clear(); }
  });

  it("does not let a later complete resume snapshot truncate an aggregate already in flight", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rows = Array.from({ length: 1206 }, (_, index) => issue(`row-${index}`, index < 536 ? "p2" : "p1", "todo", index));
    const refreshed = rows.map((row, index) => index === rows.length - 1 ? { ...row, status: "done" as const } : row);
    client.setQueryData(GLOBAL_BOARD_KEY, board(rows)); client.setQueryData(["issues", "p1"], rows.slice(536));
    let finish!: (response: Response) => void;
    const fetch = vi.fn((path: string) => path === "/api/me/issues" ? Promise.resolve(Response.json(refreshed))
      : new Promise<Response>((resolve) => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    try {
      const aggregate = client.fetchQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn, staleTime: 0 });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await refreshGlobalIssueSnapshot(client);
      finish(Response.json(board(rows)));
      await aggregate;
      expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues).toHaveLength(1206);
      expect(client.getQueryData<Issue[]>(["issues", "p1"])).toHaveLength(670);
      expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues.at(-1)?.status).toBe("done");
    } finally { client.clear(); }
  });
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
      issue("a", "p1", "in_progress", 20),
      issue("z", "p2", "todo", 1),
    ]);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });

  it("leaves the global board untouched when a project read carries nothing new", () => {
    const client = new QueryClient();
    const rows = [issue("a", "p1", "todo", 1), issue("z", "p2", "todo", 2), issue("b", "p1", "todo", 3)];
    rows[0].category_ids = ["c1", "c2"];
    client.setQueryData(GLOBAL_BOARD_KEY, board(rows));
    const before = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
    const updatedAt = client.getQueryState(GLOBAL_BOARD_KEY)?.dataUpdatedAt;

    reconcileProjectIssuesInGlobalCache(client, "p1", [
      { ...issue("b", "p1", "todo", 3), resource_count: 0 },
      { ...issue("a", "p1", "todo", 1), category_ids: ["c1", "c2"], resource_count: 2 },
    ]);

    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toBe(before);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.dataUpdatedAt).toBe(updatedAt);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(false);
  });

  it("keeps an invalidation armed elsewhere when the project slice is unchanged", async () => {
    const client = new QueryClient();
    client.setQueryData(GLOBAL_BOARD_KEY, board([issue("a", "p1", "todo", 1)]));
    await client.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY, refetchType: "none" });

    reconcileProjectIssuesInGlobalCache(client, "p1", [issue("a", "p1", "todo", 1)]);

    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });

  it("replaces only the changed rows, in place, and keeps the others' identity", () => {
    const client = new QueryClient();
    const rows = [issue("a", "p1", "todo", 1), issue("z", "p2", "todo", 2), issue("b", "p1", "todo", 3), issue("gone", "p1", "todo", 4)];
    client.setQueryData(GLOBAL_BOARD_KEY, board(rows));
    const [a, z, b] = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
    const moved = issue("a", "p1", "done", 1);

    reconcileProjectIssuesInGlobalCache(client, "p1", [
      issue("b", "p1", "todo", 3),
      issue("new", "p1", "todo", 5),
      moved,
    ]);

    const issues = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
    expect(issues.map((row) => row.id)).toEqual(["a", "z", "b", "new"]);
    expect(issues[0]).not.toBe(a);
    expect(issues[0].status).toBe("done");
    expect(issues[1]).toBe(z);
    expect(issues[2]).toBe(b);
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });

  it("replaces a row whose known resource count changed, and a moved row only once", () => {
    const client = new QueryClient();
    client.setQueryData(GLOBAL_BOARD_KEY, board([
      { ...issue("a", "p1", "todo", 1), resource_count: 1 },
      issue("m", "p2", "todo", 2),
    ]));

    reconcileProjectIssuesInGlobalCache(client, "p1", [
      { ...issue("a", "p1", "todo", 1), resource_count: 2 },
      { ...issue("m", "p1", "todo", 2), resource_count: 0 },
    ]);

    const issues = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
    expect(issues.map((row) => [row.id, row.project_id, row.resource_count])).toEqual([
      ["a", "p1", 2],
      ["m", "p1", 0],
    ]);
  });

  it("keeps resource counts and row identity across a board refetch", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counted = { ...issue("a", "p1", "todo", 1), resource_count: 3 };
    client.setQueryData(GLOBAL_BOARD_KEY, board([counted, issue("z", "p2", "todo", 2)]));
    const [cachedA, cachedZ] = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(board([issue("a", "p1", "todo", 1), issue("z", "p2", "todo", 2)]))));
    try {
      await client.fetchQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn, staleTime: 0 });
      const issues = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues;
      expect(issues[0]).toBe(cachedA);
      expect(issues[0].resource_count).toBe(3);
      expect(issues[1]).toBe(cachedZ);
    } finally { client.clear(); }
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

describe("shouldRefreshGlobalIssueSnapshot", () => {
  // The snapshot re-reads every issue; on a cold start it must not duplicate
  // the aggregate board read that is still in flight.
  const boardQuery = (observers: number, data?: unknown) => ({
    getObserversCount: () => observers,
    state: { data },
  });

  it("does not fire while the board query has no data yet", () => {
    const client = new QueryClient();
    const pending = client.getQueryCache().build(client, { queryKey: GLOBAL_BOARD_KEY, queryFn: () => Promise.resolve(board([])) });
    expect(shouldRefreshGlobalIssueSnapshot(pending)).toBe(false);
    expect(shouldRefreshGlobalIssueSnapshot(boardQuery(1))).toBe(false);
  });

  it("fires for a mounted board that already carries data", () => {
    expect(shouldRefreshGlobalIssueSnapshot(boardQuery(1, board([])))).toBe(true);
  });

  it("ignores an unmounted board and absent queries", () => {
    expect(shouldRefreshGlobalIssueSnapshot(boardQuery(0, board([])))).toBe(false);
    expect(shouldRefreshGlobalIssueSnapshot(null)).toBe(false);
    expect(shouldRefreshGlobalIssueSnapshot(undefined)).toBe(false);
  });
});
