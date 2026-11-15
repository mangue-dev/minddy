import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIssueRelationsQuery } from "./use-issue-relations-query";
import type { GlobalBoardResponse, IssueRelation } from "./types";

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), record: vi.fn(), toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mocks.toastError(...args) } }));
vi.mock("./undo/undo-context", () => ({ useUndoHistory: () => ({ record: mocks.record, currentLink: () => undefined }) }));
vi.mock("./issue-relations-api", () => ({
  addIssueRelationApi: (...args: unknown[]) => mocks.add(...args),
  fetchIssueRelationsApi: vi.fn(),
  removeIssueRelationApi: (...args: unknown[]) => mocks.remove(...args),
}));

let client: QueryClient;
let hook: ReturnType<typeof useIssueRelationsQuery>;
const key = ["issue-relations", "project"];
function Harness() { hook = useIssueRelationsQuery("project"); return null; }

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(key, []);
  client.setQueryData(["me", "board"], { relations: [] });
  vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
  renderToString(createElement(QueryClientProvider, { client }, createElement(Harness)));
});
afterEach(() => client.clear());

it("updates both caches before the POST returns and records only the persisted relation", async () => {
  let resolve!: (row: IssueRelation) => void;
  mocks.add.mockReturnValue(new Promise<IssueRelation>((res) => { resolve = res; }));
  const result = hook.addRelation("issue", "blocked_by", "objective", { targetType: "objective" });
  const optimistic = client.getQueryData<IssueRelation[]>(key)!;
  expect(optimistic).toEqual([{
    id: expect.stringMatching(/^optimistic-relation:/), source_id: "objective", source_type: "objective",
    target_id: "issue", target_type: "issue", type: "blocks",
  }]);
  expect(client.getQueryData<GlobalBoardResponse>(["me", "board"])?.relations).toEqual(optimistic);
  expect(mocks.record).not.toHaveBeenCalled();
  const created = { ...optimistic[0], id: "server" };
  resolve(created);
  await result;
  expect(client.getQueryData(key)).toEqual([created]);
  expect(mocks.record).toHaveBeenCalledWith({
    kind: "relation-add", projectId: "project", relationId: "server",
    relation: { source_id: "objective", source_type: "objective", target_id: "issue", target_type: "issue", type: "blocks" },
  }, undefined, undefined);
});

it("removes a failed addition from both caches, shows the error and records no undo", async () => {
  mocks.add.mockRejectedValue(new Error("Failed"));
  await expect(hook.addRelation("issue", "related", "objective", { targetType: "objective" })).resolves.toBeNull();
  expect(mocks.toastError).toHaveBeenCalledWith("Failed");
  expect(client.getQueryData(key)).toEqual([]);
  expect(client.getQueryData<GlobalBoardResponse>(["me", "board"])?.relations).toEqual([]);
  expect(mocks.record).not.toHaveBeenCalled();
});

const existing: IssueRelation = {
  id: "existing", source_id: "a", source_type: "issue", target_id: "b", target_type: "issue", type: "blocks",
};

it("removes a relation from the cross-project board too, and puts it back in both when the DELETE fails", async () => {
  client.setQueryData(key, [existing]);
  client.setQueryData(["me", "board"], { relations: [existing] });
  mocks.remove.mockResolvedValueOnce(undefined);
  await expect(hook.removeRelation(existing.id)).resolves.toBe(true);
  expect(client.getQueryData(key)).toEqual([]);
  expect(client.getQueryData<GlobalBoardResponse>(["me", "board"])?.relations).toEqual([]);

  client.setQueryData(key, [existing]);
  client.setQueryData(["me", "board"], { relations: [existing] });
  mocks.record.mockClear();
  mocks.remove.mockRejectedValueOnce(new Error("Gone wrong"));
  await expect(hook.removeRelation(existing.id)).resolves.toBe(false);
  expect(mocks.toastError).toHaveBeenCalledWith("Gone wrong");
  expect(client.getQueryData(key)).toEqual([existing]);
  expect(client.getQueryData<GlobalBoardResponse>(["me", "board"])?.relations).toEqual([existing]);
  expect(mocks.record).not.toHaveBeenCalled();
});
