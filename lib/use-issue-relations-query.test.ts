import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useIssueRelationsQuery } from "./use-issue-relations-query";
import type { GlobalBoardResponse, IssueRelation } from "./types";

const mocks = vi.hoisted(() => ({ add: vi.fn(), record: vi.fn() }));
vi.mock("./undo/undo-context", () => ({ useUndoHistory: () => ({ record: mocks.record }) }));
vi.mock("./issue-relations-api", () => ({
  addIssueRelationApi: (...args: unknown[]) => mocks.add(...args),
  fetchIssueRelationsApi: vi.fn(),
  removeIssueRelationApi: vi.fn(),
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
  });
});

it("removes a failed addition from both caches without recording undo", async () => {
  mocks.add.mockRejectedValue(new Error("Failed"));
  await expect(hook.addRelation("issue", "related", "objective", { targetType: "objective" })).rejects.toThrow("Failed");
  expect(client.getQueryData(key)).toEqual([]);
  expect(client.getQueryData<GlobalBoardResponse>(["me", "board"])?.relations).toEqual([]);
  expect(mocks.record).not.toHaveBeenCalled();
});
