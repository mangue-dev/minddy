import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; values: Record<string, unknown> }[],
  after: [] as (() => Promise<void>)[],
  createIssue: vi.fn(),
  events: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => state.after.push(fn) }));
vi.mock("@/lib/server/embeddings", () => ({ embedText: vi.fn(async () => null), toVectorLiteral: vi.fn() }));
vi.mock("./review", () => ({ isFeedbackReviewEnabled: async () => true, reviewFeedbackPost: vi.fn() }));
vi.mock("./notify", () => ({ notifyFeedbackTransition: vi.fn() }));
vi.mock("./events", () => ({ emitFeedbackCreated: vi.fn(), emitFeedbackFieldChanges: state.events, emitFeedbackPromoted: vi.fn() }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/feedback-post-store", () => ({
  feedbackPostStore: (client: { from: (name: string) => unknown }) => client.from("feedback_posts"),
  encodeFeedbackPost: async (row: unknown) => row, decodeFeedbackPost: async (row: unknown) => row,
}));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: (client: { from: (name: string) => unknown }) => client.from("objectives") }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: async () => ({ isOwner: true }) }));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject: state.createIssue }));
vi.mock("@/lib/server/integration-content", () => ({
  shouldProtectIntegrations: async () => false, decodeIntegration: async (row: unknown) => row,
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let inserted: Record<string, unknown> | undefined;
    let update: Record<string, unknown> | undefined;
    const rows = () => (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const finish = () => {
      if (inserted) {
        const row = { id: "new-row", status: "open", vote_count: 0, ...inserted };
        (state.tables[table] ??= []).push(row); inserted = undefined;
        return { data: row, error: null };
      }
      const row = rows()[0];
      if (row && update) Object.assign(row, update);
      return { data: row ?? null, error: null };
    };
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
      is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return q; },
      insert: (values: Record<string, unknown>) => { state.writes.push({ table, values }); inserted = values; return q; },
      update: (values: Record<string, unknown>) => { state.writes.push({ table, values }); update = values; return q; },
      upsert: () => q,
      maybeSingle: async () => finish(), single: async () => finish(),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(finish()).then(resolve),
    };
    return q;
  },
}) }));

import { createFeedbackPost, updateFeedbackPostFields } from "./posts";
import { promoteFeedbackPost } from "./promote";
import { createIntegration, updateIntegrationObjective } from "@/lib/server/integrations";
const objectiveId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foreignId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const removedId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const post = () => ({ id: "post-1", project_id: "project-1", title: "Documentation search", body: "Find examples", vote_count: 2,
  issue_id: null, merged_into_id: null, objective_id: objectiveId, feedback_post_categories: [{ category_id: "feature" }] });

beforeEach(() => {
  vi.clearAllMocks(); state.writes = []; state.after = [];
  state.tables = {
    feedback_posts: [post()],
    objectives: [{ id: objectiveId, project_id: "project-1" }, { id: foreignId, project_id: "project-2" },
      { id: removedId, project_id: "project-1", deleted_at: "2026-10-10" }],
    integrations: [{ id: "integration-1", project_id: "project-1", kind: "feedback", objective_id: null }],
  };
  state.createIssue.mockResolvedValue({ ok: true, issue: { id: "issue-1", status: "backlog" } });
});

describe("explicit feedback objectives", () => {
  it.each([true, false])("persists a default objective when analyze is %s", async (analyze) => {
    const result = await createFeedbackPost({ projectId: "project-1", title: "Search", source: "api", authorId: null, objectiveId, analyze });
    expect(result).toMatchObject({ ok: true, post: { objective_id: objectiveId } });
    expect(state.writes.find((w) => w.table === "feedback_posts")?.values.objective_id).toBe(objectiveId);
  });

  it.each([foreignId, removedId, "malformed", 3])("refuses inaccessible or invalid objectives before writing: %s", async (objective) => {
    expect(await createFeedbackPost({ projectId: "project-1", title: "Search", source: "internal", authorId: null, objectiveId: objective }))
      .toMatchObject({ ok: false, errorKey: "objectiveNotFound" });
    expect(state.writes).toEqual([]);
  });

  it("logs explicit removal without changing the linked issue", async () => {
    state.tables.feedback_posts[0].issue_id = "existing-issue";
    expect(await updateFeedbackPostFields({ postId: "post-1", actorId: "member-1", input: { objective_id: null } }))
      .toMatchObject({ ok: true, post: { objective_id: null, issue_id: "existing-issue" } });
    expect(state.events).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ updates: expect.objectContaining({ objective_id: null }) }));
    expect(state.writes.every((w) => w.table !== "issues")).toBe(true);
  });

  it("preserves an objective when unrelated fields change", async () => {
    expect(await updateFeedbackPostFields({ postId: "post-1", actorId: "member-1", input: { is_public: false } }))
      .toMatchObject({ ok: true, post: { objective_id: objectiveId } });
  });

  it.each([foreignId, removedId, undefined])("refuses an invalid objective update: %s", async (value) => {
    expect(await updateFeedbackPostFields({ postId: "post-1", actorId: "member-1", input: { objective_id: value } }))
      .toMatchObject({ ok: false, errorKey: "objectiveNotFound" });
    expect(state.writes).toEqual([]);
  });

  it.each([objectiveId, null])("promotion inherits objective %s and categories without objective inference", async (value) => {
    state.tables.feedback_posts[0].objective_id = value;
    expect(await promoteFeedbackPost({ postId: "post-1", actorId: "member-1" })).toMatchObject({ ok: true });
    expect(state.createIssue).toHaveBeenCalledWith(expect.objectContaining({ inferObjective: false,
      input: expect.objectContaining({ objective_id: value, category_ids: ["feature"] }) }));
  });

  it("lets the human promotion form override the inherited objective", async () => {
    await promoteFeedbackPost({ postId: "post-1", actorId: "member-1", input: { objective_id: null } });
    expect(state.createIssue).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ objective_id: null }) }));
  });
});

describe("feedback integration defaults", () => {
  it("stores the explicitly selected default on creation", async () => {
    expect(await createIntegration({ projectId: "project-1", actorId: "member-1", name: "Docs", kind: "feedback", objectiveId }))
      .toMatchObject({ ok: true, integration: { objective_id: objectiveId } });
  });
  it("changes only future submissions, and supports clearing", async () => {
    for (const value of [objectiveId, null]) expect(await updateIntegrationObjective({ projectId: "project-1", integrationId: "integration-1", objectiveId: value }))
      .toMatchObject({ ok: true, integration: { objective_id: value } });
    expect(state.tables.feedback_posts[0].objective_id).toBe(objectiveId);
  });
  it.each(["issues", "revoked", "foreign"])("refuses %s integrations", async (kind) => {
    if (kind === "issues") state.tables.integrations[0].kind = "issues";
    if (kind === "revoked") state.tables.integrations[0].revoked_at = "2026-10-10";
    if (kind === "foreign") state.tables.integrations[0].project_id = "project-2";
    expect(await updateIntegrationObjective({ projectId: "project-1", integrationId: "integration-1", objectiveId }))
      .toMatchObject({ ok: false, errorKey: "invalidRequest" });
  });
  it("refuses an issues integration objective before creating a key", async () => {
    expect(await createIntegration({ projectId: "project-1", actorId: "member-1", name: "Docs", kind: "issues", objectiveId }))
      .toMatchObject({ ok: false, errorKey: "invalidRequest" });
    expect(state.writes).toEqual([]);
  });
});
