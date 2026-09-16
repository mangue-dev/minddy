import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalBoardQuery, GLOBAL_BOARD_KEY } from "./use-global-board-query";
import { normalizeRelation } from "./relation-constants";
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
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn() } }));

let client: QueryClient;
let hook: ReturnType<typeof useGlobalBoardQuery>;
let invalidate: ReturnType<typeof vi.spyOn>;

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
  mocks.remove.mockResolvedValue(undefined);
  mocks.deleteIssue.mockResolvedValue(undefined);
  renderToString(createElement(QueryClientProvider, { client }, createElement(Harness)));
});

afterEach(() => client.clear());

describe("global relation mutations", () => {
  it.each<IssueRelationType>(["blocks", "blocked_by", "related"])(
    "preserves objective kinds in %s requests, cache rows, and redo snapshots",
    async (type) => {
      const kinds: RelationKinds = { targetType: "objective" };
      const created = { id: "created", ...normalizeRelation("issue", type, { id: "objective", type: "objective" }) };
      mocks.add.mockResolvedValue(created);
      await hook.addRelation("project", "issue", type, "objective", kinds);
      expect(mocks.add).toHaveBeenCalledWith("project", {
        source_id: "issue", target_id: "objective", type,
        source_type: undefined, target_type: "objective",
      });
      const { id, ...snapshot } = created;
      expect(mocks.record).toHaveBeenCalledWith({
        kind: "relation-add", projectId: "project", relationId: id, relation: snapshot,
      });
      expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations).toEqual([existing, created]);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: GLOBAL_BOARD_KEY });
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
  });

  it("restores typed cache rows without recording a failed removal", async () => {
    mocks.remove.mockRejectedValue(new Error("Failed"));
    await expect(hook.removeRelation("project", existing.id)).rejects.toThrow("Failed");
    expect(client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations).toEqual([existing]);
    expect(mocks.record).not.toHaveBeenCalled();
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
