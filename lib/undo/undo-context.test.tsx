// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { GLOBAL_BOARD_KEY, issueWrites } from "@/lib/optimistic/issue-writes";
import type { GlobalBoardResponse, Issue } from "@/lib/types";
import { toast } from "sonner";
import { HttpResponseError } from "@/lib/backend-availability";
import { UndoProvider, useUndoHistory, type UndoRecord } from "./undo-context";
import type { IssueSnapshot } from "./undo-core";

const api = vi.hoisted(() => ({
  update: vi.fn(), categories: vi.fn(), create: vi.fn(), delete: vi.fn(), fetch: vi.fn(), restore: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/issues-api", () => ({
  createIssueApi: (...args: unknown[]) => api.create(...args),
  deleteIssueApi: (...args: unknown[]) => api.delete(...args),
  fetchIssueApi: (...args: unknown[]) => api.fetch(...args),
  updateIssueApi: (...args: unknown[]) => api.update(...args),
}));
vi.mock("@/lib/categories-api", () => ({ setIssueCategoriesApi: (...args: unknown[]) => api.categories(...args) }));
vi.mock("@/lib/trash-api", () => ({ restoreTrashItemApi: (...args: unknown[]) => api.restore(...args) }));
vi.mock("@/lib/issue-relations-api", () => ({ addIssueRelationApi: vi.fn(), removeIssueRelationApi: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); issueWrites.reset(); });

const row = { id: "a", project_id: "p1", title: "A", status: "done", category_ids: [], updated_at: "2026-10-15T10:00:00.000Z" } as unknown as Issue;
const board = (issues: Issue[]): GlobalBoardResponse => ({
  issues, members: {}, categories: {}, objectives: {}, integrations: {}, relations: [],
  cycles: { enabled: false, current: null, upcoming: [], past: [] },
});

async function replayUndo(record: (history: ReturnType<typeof useUndoHistory>) => UndoRecord | null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(GLOBAL_BOARD_KEY, board([row]));
  client.setQueryData(["issues", "p1"], [row]);
  const boardReads = vi.fn(async () => board([row]));
  const projectReads = vi.fn(async () => [row]);
  const stops = [
    new QueryObserver(client, { queryKey: GLOBAL_BOARD_KEY, queryFn: boardReads }).subscribe(() => {}),
    new QueryObserver(client, { queryKey: ["issues", "p1"], queryFn: projectReads }).subscribe(() => {}),
  ];
  let history!: ReturnType<typeof useUndoHistory>;
  function Probe() {
    history = useUndoHistory();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(<QueryClientProvider client={client}><UndoProvider><Probe /></UndoProvider></QueryClientProvider>));
  record(history);
  const startedBefore = Date.now() - 1;
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    await vi.waitFor(() => expect(api.update.mock.calls.length + api.categories.mock.calls.length).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const issue = () => client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.issues[0];
  return {
    startedBefore,
    issue,
    reads: () => boardReads.mock.calls.length + projectReads.mock.calls.length,
    close: async () => { stops.forEach((stop) => stop()); await act(() => root.unmount()); client.clear(); },
  };
}

it("merges the server row of an undone field update without refetching the board", async () => {
  const server = { ...row, status: "todo", completed_at: null, updated_at: "2026-10-15T10:00:05.000Z" } as Issue;
  api.update.mockResolvedValue(server);
  const replay = await replayUndo((history) =>
    history.record({ kind: "update", projectId: "p1", issueId: "a", before: { status: "todo" }, after: { status: "done" } }));
  try {
    expect(api.update).toHaveBeenCalledWith("a", { status: "todo" });
    expect(replay.issue()).toEqual(server);
    expect(replay.reads()).toBe(0);
    // A board read that left before the acknowledgement keeps the replayed state.
    expect(issueWrites.apply([row], replay.startedBefore)[0]).toMatchObject({ status: "todo", updated_at: server.updated_at });
  } finally { await replay.close(); }
});

it("keeps an undone category change without refetching the board", async () => {
  api.categories.mockResolvedValue(undefined);
  const replay = await replayUndo((history) =>
    history.record({ kind: "categories", projectId: "p1", issueId: "a", before: ["c1"], after: [] }));
  try {
    expect(replay.issue().category_ids).toEqual(["c1"]);
    expect(replay.reads()).toBe(0);
  } finally { await replay.close(); }
});

it("still refetches to restore the truth when the replay fails", async () => {
  api.update.mockRejectedValue(new Error("Gone"));
  const replay = await replayUndo((history) =>
    history.record({ kind: "update", projectId: "p1", issueId: "a", before: { status: "todo" }, after: { status: "done" } }));
  try {
    await vi.waitFor(() => expect(replay.reads()).toBe(2));
    expect(replay.issue().status).toBe("done");
  } finally { await replay.close(); }
});

const snapshot: IssueSnapshot = {
  title: "A", description: null, plan: null, status: "todo", priority: "none", effort: null,
  assignee_id: null, objective_id: null, parent_id: null, duplicate_of_id: null, due_date: null,
  position: 1, cycle_id: null, category_ids: [],
} as unknown as IssueSnapshot;
const notFound = () => new HttpResponseError("Issue not found", 404);

/** Mounts the provider, records one action, then replays the given keystrokes. */
async function replayKeys(
  record: (history: ReturnType<typeof useUndoHistory>) => void,
  keys: ("undo" | "redo")[],
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let history!: ReturnType<typeof useUndoHistory>;
  function Probe() {
    history = useUndoHistory();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(<QueryClientProvider client={client}><UndoProvider><Probe /></UndoProvider></QueryClientProvider>));
  record(history);
  for (const key of keys) {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: key === "redo" }));
      // Let the serial replay queue drain.
      for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return async () => { await act(() => root.unmount()); client.clear(); };
}

const recordDelete = (history: ReturnType<typeof useUndoHistory>) =>
  history.record({ kind: "delete", projectId: "p1", issueId: "a", snapshot, childIds: [], relations: [] });

it("restores the original issue when redoing its creation (MIN-708)", async () => {
  api.delete.mockResolvedValue(undefined);
  api.restore.mockResolvedValue(undefined);
  const close = await replayKeys(
    (history) => history.record({ kind: "create", projectId: "p1", issueId: "a", snapshot }),
    ["undo", "redo", "undo", "redo"],
  );
  try {
    expect(api.delete.mock.calls).toEqual([["a"], ["a"]]);
    expect(api.restore.mock.calls).toEqual([["issue", "a"], ["issue", "a"]]);
    expect(api.create).not.toHaveBeenCalled();
  } finally { await close(); }
});

it.each([
  ["a server error", () => new HttpResponseError("Database error", 500)],
  ["a network error", () => new TypeError("Failed to fetch")],
])("does not recreate a deleted issue when its restore fails with %s (MIN-709)", async (_label, error) => {
  api.restore.mockRejectedValue(error());
  const close = await replayKeys(recordDelete, ["undo"]);
  try {
    expect(api.restore).toHaveBeenCalledWith("issue", "a");
    expect(api.fetch).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  } finally { await close(); }
});

it("treats a restore whose response was lost as done (MIN-709)", async () => {
  // The first restore committed; a later one finds the row live, no longer in the trash.
  api.restore.mockRejectedValue(notFound());
  api.fetch.mockResolvedValue({ ...row, deleted_at: null });
  const close = await replayKeys(recordDelete, ["undo"]);
  try {
    expect(api.fetch).toHaveBeenCalledWith("a");
    expect(api.create).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  } finally { await close(); }
});

it("recreates the issue only once it is definitively gone (MIN-709)", async () => {
  api.restore.mockRejectedValue(notFound());
  api.fetch.mockRejectedValue(notFound());
  api.create.mockResolvedValue({ ...row, id: "copy" });
  api.update.mockResolvedValue({ ...row, id: "copy" });
  const close = await replayKeys(recordDelete, ["undo"]);
  try {
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.mock.calls[0][0]).toBe("p1");
  } finally { await close(); }
});

it("propagates an outage while checking whether the issue is gone (MIN-709)", async () => {
  api.restore.mockRejectedValue(notFound());
  api.fetch.mockRejectedValue(new HttpResponseError("Database error", 503));
  const close = await replayKeys(recordDelete, ["undo"]);
  try {
    expect(api.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  } finally { await close(); }
});

const recordUpdate = (history: ReturnType<typeof useUndoHistory>, issueId: string, link?: string) =>
  history.record(
    { kind: "update", projectId: "p1", issueId, before: { priority: "none" }, after: { priority: "high" } },
    undefined,
    link,
  );

it("undoes and redoes a linked gesture in one keystroke each (MIN-795)", async () => {
  api.update.mockImplementation(async (id: string) => ({ ...row, id }));
  const close = await replayKeys((history) => {
    recordUpdate(history, "earlier");
    history.linked(() => ["a", "b", "c"].forEach((id) => recordUpdate(history, id)));
  }, ["undo"]);
  try {
    expect(api.update.mock.calls.map(([id]) => id)).toEqual(["c", "b", "a"]);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("undoneLinked");
  } finally { await close(); }
});

it("replays a linked gesture forward in its original order, then stops at the previous edit", async () => {
  api.update.mockImplementation(async (id: string) => ({ ...row, id }));
  const close = await replayKeys((history) => {
    recordUpdate(history, "earlier");
    history.linked(() => ["a", "b"].forEach((id) => recordUpdate(history, id)));
  }, ["undo", "redo", "undo", "undo"]);
  try {
    expect(api.update.mock.calls.map(([id, patch]) => [id, patch.priority])).toEqual([
      ["b", "none"], ["a", "none"],
      ["a", "high"], ["b", "high"],
      ["b", "none"], ["a", "none"],
      ["earlier", "none"],
    ]);
  } finally { await close(); }
});

it("links an entry recorded after an await through the captured link", async () => {
  api.update.mockImplementation(async (id: string) => ({ ...row, id }));
  const close = await replayKeys((history) => {
    let late: string | undefined;
    history.linked(() => {
      recordUpdate(history, "a");
      late = history.currentLink();
    });
    expect(history.currentLink()).toBeUndefined();
    recordUpdate(history, "b", late);
  }, ["undo"]);
  try {
    expect(api.update.mock.calls.map(([id]) => id)).toEqual(["b", "a"]);
  } finally { await close(); }
});
