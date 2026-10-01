import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { PendingRelationInput } from "./types";

const mocks = vi.hoisted(() => ({
  error: vi.fn(), insert: vi.fn(), merge: vi.fn(), remember: vi.fn(),
}));
vi.mock("mangue-ui", () => ({ toast: { error: mocks.error } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("./last-create-project", () => ({ rememberCreateProject: mocks.remember }));
vi.mock("./optimistic/issue-writes", () => ({
  insertIssueEverywhere: mocks.insert, mergeServerIssue: mocks.merge,
}));
vi.mock("./global-issues-api", () => ({ reconcileProjectIssuesInGlobalCache: vi.fn() }));
vi.mock("./undo/undo-core", () => ({ snapshotIssue: (issue: unknown) => issue }));

import { createIssueApi } from "./issues-api";
import { createObjectiveApi } from "./objectives-api";
import { createIssueDeferred } from "./create-issue-deferred";

const relations: PendingRelationInput[] = [
  { type: "blocks", target_id: "issue-target", target_type: "issue", target_label: "MIN-12 Target issue" },
  { type: "blocked_by", target_id: "objective-target", target_type: "objective", target_label: "Target objective" },
  { type: "related", target_id: "another-issue", target_type: "issue", target_label: "MIN-13 Related issue" },
];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  request = vi.fn().mockResolvedValue(json({ id: "relation" }));
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

describe("relations selected during creation", () => {
  it.each(["issue", "objective"] as const)("saves %s links only after creation, preserving direction and endpoint kinds", async (sourceType) => {
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const creation = sourceType === "issue"
      ? createIssueApi("project", { title: "New issue", relations })
      : createObjectiveApi("project", { name: "New objective", relations });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(`/api/projects/project/${sourceType === "issue" ? "issues" : "objectives"}`);
    expect(JSON.parse(options.body)).not.toHaveProperty("relations");
    finish(json({ id: "new-entity" }));
    await expect(creation).resolves.toEqual({ id: "new-entity" });
    expect(request).toHaveBeenCalledTimes(4);
    relations.forEach((relation, index) => {
      expect(request.mock.calls[index + 1][0]).toBe("/api/projects/project/issue-relations");
      expect(JSON.parse(request.mock.calls[index + 1][1].body)).toEqual({
        source_id: "new-entity", source_type: sourceType,
        target_id: relation.target_id, target_type: relation.target_type, type: relation.type,
      });
    });
  });

  it.each(["issue", "objective"] as const)("does not save links when %s creation fails", async (sourceType) => {
    request.mockResolvedValueOnce(json({ error: "Creation rejected" }, 400));
    const creation = sourceType === "issue"
      ? createIssueApi("project", { title: "New issue", relations })
      : createObjectiveApi("project", { name: "New objective", relations });
    await expect(creation).rejects.toThrow("Creation rejected");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["issue", "objective"] as const)("keeps the created %s and saves remaining links after one link fails", async (sourceType) => {
    request.mockResolvedValueOnce(json({ id: "new-entity" }))
      .mockResolvedValueOnce(json({ error: "Target no longer exists" }, 404));
    const creation = sourceType === "issue"
      ? createIssueApi("project", { title: "New issue", relations })
      : createObjectiveApi("project", { name: "New objective", relations });
    await expect(creation).resolves.toEqual({ id: "new-entity" });
    expect(request).toHaveBeenCalledTimes(4);
    expect(mocks.error).toHaveBeenCalledWith("Target no longer exists", { description: relations[0].target_label });
  });

  it("adds no requests to creation without relations", async () => {
    request.mockResolvedValueOnce(json({ id: "issue" }));
    await createIssueApi("project", { title: "New issue" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves selections through deferred Smart Fill creation without using a provisional id", async () => {
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const record = vi.fn();
    const client = {} as QueryClient;
    createIssueDeferred({ queryClient: client, projectId: "project", input: { title: "New issue", smart_fill: true, relations }, record });
    expect(request).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
    finish(json({ id: "server-id" }));
    await vi.waitFor(() => expect(record).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledWith(client, "project", { id: "server-id" });
    expect(JSON.parse(request.mock.calls[1][1].body).source_id).toBe("server-id");
  });
});
