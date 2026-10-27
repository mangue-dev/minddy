import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerMinddyTools } from "./tools";
import type { ToolExtra, ToolResult } from "./tool-helpers";

const { updateIssueFields, setIssueCategories, addIssueRelation, findIssueRelation, removeIssueRelation } =
  vi.hoisted(() => ({
    updateIssueFields: vi.fn(),
    setIssueCategories: vi.fn(),
    addIssueRelation: vi.fn(),
    findIssueRelation: vi.fn(),
    removeIssueRelation: vi.fn(),
  }));
vi.mock("@/lib/server/update-issue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/update-issue")>()),
  updateIssueFields,
}));
vi.mock("@/lib/server/set-issue-categories", () => ({ setIssueCategories }));
vi.mock("@/lib/server/issue-relations", () => ({ addIssueRelation, findIssueRelation, removeIssueRelation }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
const { getProjectFeedbackPost, updateFeedbackPostFields } = vi.hoisted(() => ({
  getProjectFeedbackPost: vi.fn(),
  updateFeedbackPostFields: vi.fn(),
}));
vi.mock("@/lib/server/feedback/team-guard", () => ({ getProjectFeedbackPost }));
const { updateObjective, objectiveRow } = vi.hoisted(() => ({
  updateObjective: vi.fn(),
  objectiveRow: { current: null as Record<string, unknown> | null },
}));
vi.mock("@/lib/server/objectives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/objectives")>()),
  updateObjective,
}));
vi.mock("@/lib/server/objective-store", async (importOriginal) => {
  const query = {
    select: () => query,
    is: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: objectiveRow.current, error: null }),
  };
  return {
    ...(await importOriginal<typeof import("@/lib/server/objective-store")>()),
    objectiveStore: () => query,
  };
});
vi.mock("@/lib/server/feedback/posts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/feedback/posts")>()),
  updateFeedbackPostFields,
}));
vi.mock("./tool-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tool-helpers")>();
  return {
    ...actual,
    requireProject: vi.fn(async () => ({ userId: "user-1", keyId: "key-1", access: { project: { id: "project-1", key: "MIN" } } })),
    // "MIN-N" and the bare number "N" name the same issue, as in the real resolver.
    resolveIssueRef: vi.fn(async (_access, ref: string) => {
      const number = /^(?:MIN-)?(\d+)$/.exec(ref)?.[1];
      return number
        ? { issue: { id: `issue-${number}`, identifier: `MIN-${number}` } }
        : { error: actual.fail("issue_not_found", `Issue '${ref}' not found`) };
    }),
  };
});

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

async function call(tool: string, args: Record<string, unknown>) {
  const result = await handlers.get(tool)!({ project_id: "project-1", ...args }, {});
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateIssueFields.mockResolvedValue({ ok: true });
  setIssueCategories.mockResolvedValue({ ok: true });
  addIssueRelation.mockResolvedValue({ ok: true });
  removeIssueRelation.mockResolvedValue({ ok: true });
  findIssueRelation.mockResolvedValue(null);
  getProjectFeedbackPost.mockImplementation(async (_project: string, id: string) =>
    id.startsWith("aaaaaaaa")
      ? null
      : { id, title: `Post ${id.slice(0, 1)}`, issue_id: id.startsWith("cccccccc") ? "issue-9" : null });
  updateFeedbackPostFields.mockImplementation(async ({ postId, input }: { postId: string; input: Record<string, unknown> }) =>
    ({ ok: true, post: { id: postId, title: `Post ${postId.slice(0, 1)}`, is_public: true, review_state: "published", ...input } }));
});

describe("minddy_update_issues", () => {
  it("applies each entry's own fields in one call", async () => {
    const { body } = await call("minddy_update_issues", {
      issues: ["MIN-1"],
      fields: { priority: "high", effort: "s" },
      updates: [{ issue: "MIN-2", fields: { priority: "low" } }],
    });
    expect(body).toEqual({ updated: ["MIN-1", "MIN-2"], failed: [] });
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: "issue-1", input: { priority: "high", effort: "s" }, mcpKeyId: "key-1" }),
    );
    expect(updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: "issue-2", input: { priority: "low" } }),
    );
  });

  it("reports per-entry failures without stopping the rest, in input order", async () => {
    updateIssueFields.mockImplementation(async ({ issueId }: { issueId: string }) =>
      issueId === "issue-2" ? { ok: false, status: 400, errorKey: "invalidStatus" } : { ok: true },
    );
    const { body } = await call("minddy_update_issues", {
      issues: ["MIN-1", "MIN-2"],
      fields: { status: "todo" },
      updates: [
        { issue: "nope", fields: { status: "todo" } },
        { issue: "MIN-3", fields: { parent: "nope" } },
        { issue: "MIN-4", fields: {} },
      ],
    });
    expect(body.updated).toEqual(["MIN-1"]);
    expect(body.failed.map((f: { issue: string }) => f.issue)).toEqual(["MIN-2", "nope", "MIN-3", "MIN-4"]);
    expect(body.failed[3].error).toMatch(/at least one field/);
  });

  it("refuses the second entry naming an issue already in the call", async () => {
    const { body } = await call("minddy_update_issues", {
      issues: ["MIN-7"],
      fields: { priority: "high" },
      updates: [{ issue: "7", fields: { priority: "low" } }],
    });
    expect(body.updated).toEqual(["MIN-7"]);
    expect(body.failed).toEqual([{ issue: "MIN-7", error: expect.stringMatching(/more than once/) }]);
    expect(updateIssueFields).toHaveBeenCalledTimes(1);
  });

  it("refuses the LATER duplicate even when it resolves first", async () => {
    const { resolveIssueRef } = await import("./tool-helpers");
    const real = vi.mocked(resolveIssueRef).getMockImplementation()!;
    vi.mocked(resolveIssueRef).mockImplementation(async (access, ref) => {
      // The identifier resolves after the bare number does.
      if (ref === "MIN-8") for (let i = 0; i < 5; i++) await Promise.resolve();
      return real(access, ref);
    });
    const { body } = await call("minddy_update_issues", {
      issues: ["MIN-8"],
      fields: { priority: "high" },
      updates: [{ issue: "8", fields: { priority: "low" } }],
    });
    vi.mocked(resolveIssueRef).mockImplementation(real);
    expect(updateIssueFields).toHaveBeenCalledTimes(1);
    expect(updateIssueFields.mock.calls[0][0].input).toEqual({ priority: "high" });
    expect(body.failed).toEqual([{ issue: "MIN-8", error: expect.stringMatching(/more than once/) }]);
  });

  it("writes parent changes one at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    updateIssueFields.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return { ok: true };
    });
    await call("minddy_update_issues", {
      issues: ["MIN-1", "MIN-2"],
      fields: { priority: "low" },
      updates: [{ issue: "MIN-3", fields: { parent: "MIN-1" } }],
    });
    expect(updateIssueFields).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });

  it("keeps the shared shape, deduplicating repeated refs", async () => {
    const { body } = await call("minddy_update_issues", {
      issues: ["MIN-1", "MIN-2", "MIN-1"],
      fields: { status: "done" },
    });
    expect(body).toEqual({ updated: ["MIN-1", "MIN-2"], failed: [] });
    expect(updateIssueFields).toHaveBeenCalledTimes(2);
  });

  it("still refuses a shared call whose fields cannot be prepared", async () => {
    const { isError, body } = await call("minddy_update_issues", {
      issues: ["MIN-1"],
      fields: { parent: "nope" },
    });
    expect(isError).toBe(true);
    expect(body.error.code).toBe("issue_not_found");
    expect(updateIssueFields).not.toHaveBeenCalled();
  });

  it("refuses more than 50 issues across issues and updates", async () => {
    const { isError, body } = await call("minddy_update_issues", {
      issues: Array.from({ length: 30 }, (_, i) => `MIN-${i + 1}`),
      fields: { status: "done" },
      updates: Array.from({ length: 21 }, (_, i) => ({ issue: `MIN-${i + 100}`, fields: { status: "done" } })),
    });
    expect(isError).toBe(true);
    expect(body.error.code).toBe("invalid_params");
    expect(updateIssueFields).not.toHaveBeenCalled();
  });
});

describe("minddy_link_issues", () => {
  it("writes several relations in order with per-link results", async () => {
    addIssueRelation.mockImplementation(async ({ targetId }: { targetId: string }) =>
      targetId === "issue-3" ? { ok: false, status: 409, rawMessage: "That would create a cycle." } : { ok: true },
    );
    const { body } = await call("minddy_link_issues", {
      issue: "MIN-1",
      relation: "blocks",
      target: "MIN-2",
      links: [
        { issue: "MIN-2", relation: "blocks", target: "MIN-3" },
        { issue: "MIN-4", relation: "related", target: "MIN-4" },
        { issue: "MIN-5", relation: "related", target: "MIN-6", remove: true },
      ],
    });
    expect(body.results).toEqual([
      expect.objectContaining({ index: 0, added: true, source: "MIN-1", target: "MIN-2" }),
      expect.objectContaining({ index: 3, removed: false, source: "MIN-5", target: "MIN-6" }),
    ]);
    expect(body.failed).toEqual([
      { index: 1, error: "That would create a cycle." },
      { index: 2, error: "An entity can't be related to itself." },
    ]);
    expect(addIssueRelation.mock.calls.map(([input]) => input.sourceId)).toEqual(["issue-1", "issue-2"]);
  });

});

describe("minddy_update_feedback", () => {
  const post = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

  it("triages a batch of posts with per-post refusals", async () => {
    const { body } = await call("minddy_update_feedback", {
      feedback_post_id: post("b"),
      feedback_post_ids: [post("a"), post("c"), post("d"), post("b")],
      status: "declined",
    });
    expect(body.updated.map((p: { id: string }) => p.id)).toEqual([post("b"), post("d")]);
    expect(body.failed).toEqual([
      { feedback_post_id: post("a"), error: "Feedback post not found in this project." },
      { feedback_post_id: post("c"), error: expect.stringMatching(/linked to an issue/) },
    ]);
    expect(updateFeedbackPostFields).toHaveBeenCalledTimes(2);
  });

  it("keeps the single-post reply shape", async () => {
    const { body } = await call("minddy_update_feedback", { feedback_post_id: post("b"), is_public: false });
    expect(body).toEqual({ feedback: expect.objectContaining({ id: post("b"), is_public: false }) });
  });
});

describe("minddy_update_objective description_edits", () => {
  const objective = "11111111-1111-4111-8111-111111111111";
  beforeEach(() => {
    objectiveRow.current = { id: objective, description: "Ship v1.\n\nOut of scope: mobile.", updated_at: "2026-10-27T10:00:00Z" };
    updateObjective.mockResolvedValue({ ok: true, objective: { id: objective } });
  });

  it("patches passages of the current description and writes the result", async () => {
    const { isError } = await call("minddy_update_objective", {
      objective_id: objective,
      status: "in_progress",
      description_edits: [
        { old_string: "Ship v1.", new_string: "Ship v1 by March." },
        { old_string: "mobile", new_string: "mobile and desktop" },
      ],
    });
    expect(isError).toBe(false);
    expect(updateObjective).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.objectContaining({ description_edits: expect.anything() }),
    }));
    expect(updateObjective.mock.calls[0][0].input).toMatchObject({
      status: "in_progress",
      description: "Ship v1 by March.\n\nOut of scope: mobile and desktop.",
    });
    // The write is conditioned on the revision the description was read at.
    expect(updateObjective.mock.calls[0][0].expectedUpdatedAt).toBe("2026-10-27T10:00:00Z");
  });

  it("appends a block after the edits, and guards plain updates by nothing", async () => {
    await call("minddy_update_objective", {
      objective_id: objective,
      description_edits: [{ old_string: "Ship v1.", new_string: "Ship v1 by March." }],
      description_append: "## Risks\n\nThe store review.",
    });
    expect(updateObjective.mock.calls[0][0].input.description).toBe(
      "Ship v1 by March.\n\nOut of scope: mobile.\n\n## Risks\n\nThe store review.",
    );
    await call("minddy_update_objective", { objective_id: objective, status: "done" });
    expect(updateObjective.mock.calls[1][0].expectedUpdatedAt).toBeNull();
    expect(updateObjective.mock.calls[1][0].input).not.toHaveProperty("description");
  });

  it("writes nothing when a passage does not match, or when both forms are sent", async () => {
    const stale = await call("minddy_update_objective", {
      objective_id: objective,
      description_edits: [{ old_string: "Ship v2.", new_string: "x" }],
    });
    expect(stale.body.error.code).toBe("text_not_found");
    const both = await call("minddy_update_objective", {
      objective_id: objective,
      description: "New",
      description_edits: [{ old_string: "Ship v1.", new_string: "x" }],
    });
    expect(both.body.error.code).toBe("invalid_params");
    expect(updateObjective).not.toHaveBeenCalled();
  });
});
