import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  projectId: "project-a",
  reads: [] as string[],
  commentReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const filters = new Map<string, unknown>();
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.set(column, value);
        return query;
      },
      is: () => query,
      maybeSingle: async () => {
        state.reads.push(String(filters.get("project_id")));
        return { data: filters.get("project_id") === state.projectId
          ? { number: 12, title: "Private ticket", description: null,
              plan: null, projects: { key: "MIN" } }
          : null };
      },
    };
    return query;
  },
}));
vi.mock("@/lib/server/comment-store", () => ({
  commentStore: () => {
    state.commentReads++;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: [] }),
    };
    return query;
  },
}));

import { loadPrIssueContext } from "./pr-run";

beforeEach(() => {
  state.reads = [];
  state.commentReads = 0;
});

describe("pull request issue context", () => {
  it("does not decrypt the issue thread outside the run project", async () => {
    expect(await loadPrIssueContext("issue-a", "project-b")).toBeNull();
    expect(state.reads).toEqual(["project-b"]);
    expect(state.commentReads).toBe(0);
  });

  it("loads the thread only after the issue project matches", async () => {
    const context = await loadPrIssueContext("issue-a", "project-a");
    expect(context).toMatchObject({ identifier: "MIN-12", title: "Private ticket" });
    expect(state.commentReads).toBe(1);
  });
});
