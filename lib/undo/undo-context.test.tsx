// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { GLOBAL_BOARD_KEY, issueWrites } from "@/lib/optimistic/issue-writes";
import type { GlobalBoardResponse, Issue } from "@/lib/types";
import { UndoProvider, useUndoHistory, type UndoRecord } from "./undo-context";

const api = vi.hoisted(() => ({ update: vi.fn(), categories: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/issues-api", () => ({
  createIssueApi: vi.fn(),
  deleteIssueApi: vi.fn(),
  updateIssueApi: (...args: unknown[]) => api.update(...args),
}));
vi.mock("@/lib/categories-api", () => ({ setIssueCategoriesApi: (...args: unknown[]) => api.categories(...args) }));
vi.mock("@/lib/trash-api", () => ({ restoreTrashItemApi: vi.fn() }));
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
