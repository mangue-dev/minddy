import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRelationOptimistically, applyPendingRelations, forgetRelationWrite, persistedRelationId, relationsKey } from "./relation-writes";
import type { GlobalBoardResponse, IssueRelation, IssueRelationType } from "../types";
import { normalizeRelation } from "../relation-constants";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let client: QueryClient;
const boardKey = ["me", "board"];
const existing: IssueRelation = { id: "existing", source_id: "a", target_id: "b", type: "related" };
const projectRows = () => client.getQueryData<IssueRelation[]>(relationsKey("project"))!;
const boardRows = () => client.getQueryData<GlobalBoardResponse>(boardKey)!.relations;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData(relationsKey("project"), [existing]);
  client.setQueryData(boardKey, { relations: [existing] });
});
afterEach(() => client.clear());

describe("optimistic relation additions", () => {
  it.each<IssueRelationType>(["blocks", "blocked_by", "related"])("shows %s immediately with objective endpoint kinds and reconciles IDs", async (type) => {
    const request = deferred<IssueRelation>();
    const input = { source_id: "issue", target_id: "objective", target_type: "objective" as const, type };
    const result = addRelationOptimistically(client, "project", input, () => request.promise);
    const normalized = normalizeRelation("issue", type, { id: "objective", type: "objective" });
    expect(projectRows()).toEqual([existing, { id: expect.stringMatching(/^optimistic-relation:/), ...normalized }]);
    expect(boardRows()).toEqual(projectRows());
    const created = { id: "server", ...normalized };
    request.resolve(created);
    await expect(result).resolves.toEqual(created);
    expect(projectRows()).toEqual([existing, created]);
    expect(boardRows()).toEqual(projectRows());
  });

  it.each(["success", "failure"] as const)("leaves an unfetched project cache absent after %s so opening it reads all relations", async (outcome) => {
    const key = relationsKey("project");
    client.removeQueries({ queryKey: key, exact: true });
    client.setDefaultOptions({ queries: { staleTime: 5 * 60_000 } });
    const request = deferred<IssueRelation>();
    const input = { source_id: "x", target_id: "y", type: "blocks" as const };
    const result = addRelationOptimistically(client, "project", input, () => request.promise);
    expect(client.getQueryState(key)).toBeUndefined();
    expect(boardRows()).toEqual([existing, expect.objectContaining({ source_id: "x", target_id: "y", type: "blocks" })]);

    const created = { id: "server", ...input };
    if (outcome === "success") {
      request.resolve(created);
      await result;
      expect(boardRows()).toEqual([existing, created]);
    } else {
      const rejected = expect(result).rejects.toThrow("Failed");
      request.reject(new Error("Failed"));
      await rejected;
      expect(boardRows()).toEqual([existing]);
    }
    expect(client.getQueryState(key)).toBeUndefined();

    const serverRows = outcome === "success" ? [existing, created] : [existing];
    const fetchRelations = vi.fn().mockResolvedValue(serverRows);
    await expect(client.fetchQuery({ queryKey: key, queryFn: fetchRelations })).resolves.toEqual(serverRows);
    expect(fetchRelations).toHaveBeenCalledTimes(1);
    expect(projectRows()).toEqual(serverRows);
  });

  it("rolls back only the failed write while retaining concurrent additions and cache edits", async () => {
    const failed = deferred<IssueRelation>();
    const successful = deferred<IssueRelation>();
    const first = addRelationOptimistically(client, "project", { source_id: "a", target_id: "c", type: "blocks" }, () => failed.promise);
    const second = addRelationOptimistically(client, "project", { source_id: "a", target_id: "d", type: "blocks" }, () => successful.promise);
    const created = { id: "server", source_id: "a", target_id: "d", type: "blocks" as const };
    successful.resolve(created);
    await second;
    const remote = { ...existing, id: "remote", target_id: "e" };
    client.setQueryData(relationsKey("project"), [...projectRows(), remote]);
    const rejected = expect(first).rejects.toThrow("Failed");
    failed.reject(new Error("Failed"));
    await rejected;
    expect(projectRows()).toEqual([existing, remote, created]);
    expect(boardRows()).toEqual([existing, created]);
  });

  it("overlays stale responses before and after confirmation without leaking between projects", async () => {
    const request = deferred<IssueRelation>();
    const startedAt = Date.now() - 1;
    const result = addRelationOptimistically(client, "project", { source_id: "x", target_id: "y", type: "related" }, () => request.promise);
    expect(applyPendingRelations(client, [], startedAt, "project")).toEqual(projectRows().slice(1));
    expect(applyPendingRelations(client, [], startedAt, "other-project")).toEqual([]);
    expect(applyPendingRelations(new QueryClient(), [], startedAt)).toEqual([]);
    const created = { id: "server", source_id: "x", target_id: "y", type: "related" as const };
    request.resolve(created);
    await result;
    expect(applyPendingRelations(client, [], startedAt)).toEqual([created]);
    expect(applyPendingRelations(client, [], Date.now() + 1)).toEqual([]);
  });

  it("coalesces reversed duplicate requests and retains a realtime echo's persisted ID", async () => {
    const request = deferred<IssueRelation>();
    const save = vi.fn(() => request.promise);
    const first = addRelationOptimistically(client, "project", { source_id: "x", target_id: "y", type: "related" }, save);
    const second = addRelationOptimistically(client, "project", { source_id: "y", target_id: "x", type: "related" }, save);
    expect(second).toBe(first);
    expect(save).toHaveBeenCalledTimes(1);
    const created = { id: "server", source_id: "x", target_id: "y", type: "related" as const };
    expect(applyPendingRelations(client, [created], 0)).toEqual([created]);
    request.resolve(created);
    await first;
    expect(projectRows()).toEqual([existing, created]);
  });

  it("keeps an existing canonical relation when an idempotent request fails", async () => {
    const result = addRelationOptimistically(client, "project", { source_id: "b", target_id: "a", type: "related" }, () => Promise.reject(new Error("Failed")));
    expect(projectRows()).toEqual([existing]);
    await expect(result).rejects.toThrow("Failed");
    expect(projectRows()).toEqual([existing]);
  });

  it("does not resurrect a confirmed addition after undo removes it", async () => {
    const created = { id: "server", source_id: "x", target_id: "y", type: "blocks" as const };
    await addRelationOptimistically(client, "project", { source_id: "x", target_id: "y", type: "blocks" }, () => Promise.resolve(created));
    forgetRelationWrite(client, created.id);
    expect(applyPendingRelations(client, [], 0)).toEqual([]);
  });

  it("waits for a persisted ID when a pending relation is removed", async () => {
    const request = deferred<IssueRelation>();
    const result = addRelationOptimistically(client, "project", { source_id: "x", target_id: "y", type: "blocks" }, () => request.promise);
    const removal = persistedRelationId(client, projectRows()[1].id);
    request.resolve({ id: "server", source_id: "x", target_id: "y", type: "blocks" });
    await result;
    await expect(removal).resolves.toBe("server");
    expect(applyPendingRelations(client, [], 0)).toEqual([]);
  });
});
