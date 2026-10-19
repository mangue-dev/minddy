import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalBoardQuery, GLOBAL_BOARD_KEY } from "./use-global-board-query";
import { normalizeRelation } from "./relation-constants";
import { applyPendingIssues, issueWrites } from "./optimistic/issue-writes";
import { applyPendingRelations, isOwnRelationEcho } from "./optimistic/relation-writes";
import type { GlobalBoardResponse, Issue, IssueRelation, IssueRelationType } from "./types";
import type { RelationKinds } from "./use-issue-relations-query";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  deleteIssue: vi.fn(),
}));

vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("./undo/undo-context", () => ({ useUndoHistory: () => ({ record: mocks.record }) }));
vi.mock("./issue-relations-api", () => ({
  addIssueRelationApi: (...args: unknown[]) => mocks.add(...args),
  removeIssueRelationApi: (...args: unknown[]) => mocks.remove(...args),
}));
vi.mock("./issues-api", () => ({
  createIssueApi: vi.fn(),
  updateIssueApi: vi.fn(),
  deleteIssueApi: (...args: unknown[]) => mocks.deleteIssue(...args),
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { error: vi.fn() },
}));

let client: QueryClient;
let hook: ReturnType<typeof useGlobalBoardQuery>;
let invalidate: ReturnType<typeof vi.spyOn>;
let cancel: ReturnType<typeof vi.spyOn>;

const issue = { id: "issue", project_id: "project", title: "Issue", status: "todo", category_ids: [] } as unknown as Issue;
const existing: IssueRelation = {
  id: "existing",
  source_id: "objective",
  source_type: "objective",
  target_id: issue.id,
  target_type: "issue",
  type: "blocks",
};

function Harness() {
  hook = useGlobalBoardQuery();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, {
    issues: [issue], members: {}, categories: {}, objectives: {}, integrations: {},
    relations: [existing], cycles: { enabled: false, current: null, upcoming: [], past: [] },
  });
  invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
  cancel = vi.spyOn(client, "cancelQueries").mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.deleteIssue.mockResolvedValue(undefined);
  renderToString(createElement(QueryClientProvider, { client }, createElement(Harness)));
});

afterEach(() => { client.clear(); issueWrites.reset(); });

describe("global relation mutations", () => {
  it("shows an addition in both caches before confirmation and rolls back a failed POST", async () => {
    client.setQueryData(["issue-relations", "project"], []);
    let reject!: (error: Error) => void;
    mocks.add.mockReturnValue(new Promise<IssueRelation>((_resolve, rej) => { reject = rej; }));
    const result = hook.addRelation("project", "other-issue", "related", "objective", { targetType: "objective" });
    const rows = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.relations;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ source_id: "objective", source_type: "objective", target_id: "other-issue", target_type: "issue", type: "related" });
    expect(client.getQueryData(["issue-relations", "project"])).toEqual([rows[1]]);
    expect(mocks.record).not.toHaveBeenCalled();
    const rejected = expect(result).rejects.toThrow("Failed");
    reject(new Error("Failed"));
    await rejected;
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)!.relations).toEqual([existing]);
    expect(client.getQueryData(["issue-relations", "project"])).toEqual([]);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each<IssueRelationType>(["blocks", "blocked_by", "related"])(
    "preserves objective kinds in %s requests, cache rows, and redo snapshots",
    async (type) => {
      const kinds: RelationKinds = { targetType: "objective" };
      const created = { id: "created", ...normalizeRelation("other-issue", type, { id: "objective", type: "objective" }) };
      mocks.add.mockResolvedValue(created);
      await hook.addRelation("project", "other-issue", type, "objective", kinds);
      expect(mocks.add).toHaveBeenCalledWith("project", {
        source_id: "other-issue", target_id: "objective", type,
        source_type: undefined, target_type: "objective",
      });
      const { id, ...snapshot } = created;
      expect(mocks.record).toHaveBeenCalledWith({
        kind: "relation-add", projectId: "project", relationId: id, relation: snapshot,
      });
      expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations).toEqual([existing, created]);
      expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: GLOBAL_BOARD_KEY }));
      expect(cancel).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: GLOBAL_BOARD_KEY }));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["issue-relations", "project"] });
    },
  );

  it("forwards both objective kinds and retains issue-only defaults", async () => {
    mocks.add.mockResolvedValue(existing);
    await hook.addRelation("project", "objective-a", "related", "objective-b", {
      sourceType: "objective", targetType: "objective",
    });
    expect(mocks.add).toHaveBeenLastCalledWith("project", {
      source_id: "objective-a", target_id: "objective-b", type: "related",
      source_type: "objective", target_type: "objective",
    });
    await hook.addRelation("project", "a", "blocks", "b");
    expect(mocks.add).toHaveBeenLastCalledWith("project", {
      source_id: "a", target_id: "b", type: "blocks",
      source_type: undefined, target_type: undefined,
    });
  });

  it("preserves kinds when recording relation removal for undo", async () => {
    await hook.removeRelation("project", existing.id);
    const { id, ...snapshot } = existing;
    expect(mocks.record).toHaveBeenCalledWith({
      kind: "relation-remove", projectId: "project", relationId: id, relation: snapshot,
    });
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["issue-relations", "project"] });
    expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: GLOBAL_BOARD_KEY }));
  });

  it("keeps a confirmed removal out of a board read that started before it", async () => {
    const startedBefore = Date.now() - 1;
    await hook.removeRelation("project", existing.id);
    expect(applyPendingRelations(client, [existing], startedBefore)).toEqual([]);
    expect(isOwnRelationEcho(client, { operation: "DELETE", record: null, old_record: { id: existing.id } })).toBe(true);
    expect(applyPendingRelations(client, [existing], Date.now() + 1)).toEqual([existing]);
  });

  it("restores typed cache rows without recording a failed removal", async () => {
    mocks.remove.mockRejectedValue(new Error("Failed"));
    await expect(hook.removeRelation("project", existing.id)).rejects.toThrow("Failed");
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations).toEqual([existing]);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(applyPendingRelations(client, [existing], 0)).toEqual([existing]);
  });

  it("removes a deleted card at once and confirms it without refetching the board", async () => {
    let finish!: () => void;
    mocks.deleteIssue.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    client.setQueryData(["issues", "project"], [issue]);
    const result = hook.deleteIssue(issue.id, "project");
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues).toEqual([]);
    expect(client.getQueryData(["issues", "project"])).toEqual([]);
    // A read that left before the DELETE cannot bring the card back.
    expect(applyPendingIssues([issue], Date.now() - 1)).toEqual([]);
    finish();
    await result;
    expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: GLOBAL_BOARD_KEY }));
    expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["issues", "project"] }));
    expect(applyPendingIssues([issue], Date.now() + 1)).toEqual([issue]);
  });

  it("restores a card whose deletion failed", async () => {
    mocks.deleteIssue.mockRejectedValue(new Error("Failed"));
    await expect(hook.deleteIssue(issue.id, "project")).rejects.toThrow("Failed");
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues).toEqual([issue]);
    expect(applyPendingIssues([issue], 0)).toEqual([issue]);
  });

  it("preserves both endpoint directions in issue-deletion fallback snapshots", async () => {
    const outgoing: IssueRelation = { ...existing, id: "outgoing", source_id: issue.id, source_type: "issue", target_id: "objective-b", target_type: "objective" };
    client.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => ({ ...old!, relations: [existing, outgoing] }));
    await hook.deleteIssue(issue.id, "project");
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      kind: "delete",
      relations: [existing, outgoing].map(({ id: _id, ...snapshot }) => snapshot),
    }), expect.any(Promise));
  });
});
