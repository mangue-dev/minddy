import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommentMention, runObjectiveCommentMention, runPageCommentMention, runFeedbackCommentMention } from "./comment-agent";

const state = vi.hoisted(() => ({ access: vi.fn(), budget: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: state.access }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: state.budget }));
beforeEach(() => { state.access.mockReset(); state.budget.mockReset().mockResolvedValue(true); });

const cases = [
  { table: "issues", column: "issue_id", key: "issueId", run: runCommentMention },
  { table: "objectives", column: "objective_id", key: "objectiveId", run: runObjectiveCommentMention },
  { table: "pages", column: "page_id", key: "pageId", run: runPageCommentMention },
  { table: "feedback_posts", column: "feedback_post_id", key: "postId", run: runFeedbackCommentMention },
];

describe.each(cases)("$table assistant comment authorization", ({ table, column, key, run }) => {
  const fixture = () => {
    const filters: Record<string, unknown> = {};
    const from = vi.fn((name: string) => {
      const query = {
        select: () => query, is: () => query,
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        maybeSingle: async () => ({ data: name === table ? { id: "parent", project_id: "project" } : null, error: null }),
      };
      return query;
    });
    return { filters, from, input: { service: { from }, supabase: {}, actorId: "actor", triggerCommentId: "trigger", locale: "en", [key]: "parent" } };
  };
  it("does not read or decrypt the trigger before authorizing its parent", async () => {
    state.access.mockResolvedValue(null);
    const test = fixture();
    await run(test.input as never);
    expect(test.from.mock.calls.map(([name]) => name)).toEqual([table]);
  });
  it("requires the trigger to belong to the authorized parent", async () => {
    state.access.mockResolvedValue({ project: { id: "project", key: "TEST" } });
    const test = fixture();
    await run(test.input as never);
    expect(test.from.mock.calls.map(([name]) => name)).toEqual([table, table === "pages" ? "page_comments" : "comments"]);
    expect(test.filters).toMatchObject({ id: "trigger", [column]: "parent" });
  });
});
