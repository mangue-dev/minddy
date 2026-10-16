import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visible: [] as Array<{ id: string; project_id: string }>,
  listPullRequestsForIssues: vi.fn(),
  getProjectLink: vi.fn(),
  inIds: [] as string[],
}));

vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => ({
    select: () => ({
      in: (_column: string, ids: string[]) => {
        mocks.inIds = ids;
        return {
          is: async () => ({
            data: mocks.visible.filter((issue) => ids.includes(issue.id)),
            error: null,
          }),
        };
      },
    }),
  }),
}));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  listPullRequestsForIssues: mocks.listPullRequestsForIssues,
}));
vi.mock("@/lib/server/git/repo-links", () => ({ getProjectLink: mocks.getProjectLink }));

import { readIssuePromptContext } from "./issue-prompt-context";

const client = {} as never;

describe("readIssuePromptContext", () => {
  beforeEach(() => {
    mocks.visible = [
      { id: "a", project_id: "p1" },
      { id: "b", project_id: "p1" },
      { id: "c", project_id: "p2" },
    ];
    mocks.listPullRequestsForIssues.mockReset();
    mocks.getProjectLink.mockReset();
  });

  it("serves only the issues the caller can see, with every linked pull request", async () => {
    mocks.visible = mocks.visible.filter((issue) => issue.id !== "c");
    mocks.listPullRequestsForIssues.mockResolvedValue(new Map([["a", [
      { number: 12, state: "open", url: "https://forge/12", head_branch: "feat", base_branch: "main", title: "secret" },
      { number: 9, state: "merged", url: null, head_branch: null, base_branch: null },
    ]]]));
    mocks.getProjectLink.mockResolvedValue({ provider: "github", repo_full_name: "acme/app", default_branch: "main" });

    const context = await readIssuePromptContext(client, ["a", "b", "c", "a"]);

    expect(mocks.inIds).toEqual(["a", "b", "c"]);
    expect(mocks.listPullRequestsForIssues).toHaveBeenCalledWith(["a", "b"]);
    expect(Object.keys(context)).toEqual(["a", "b"]);
    expect(context.a.pullRequests).toEqual([
      { number: 12, state: "open", url: "https://forge/12", headBranch: "feat", baseBranch: "main" },
      { number: 9, state: "merged", url: null, headBranch: null, baseBranch: null },
    ]);
    // No linked pull request is an explicit empty list, not "unknown".
    expect(context.b.pullRequests).toEqual([]);
    expect(context.a.repository).toEqual({ provider: "github", fullName: "acme/app", defaultBranch: "main" });
  });

  it("reads each project's repository once, and none when it links no repository", async () => {
    mocks.listPullRequestsForIssues.mockResolvedValue(new Map());
    mocks.getProjectLink.mockImplementation(async (projectId: string) =>
      projectId === "p1" ? { provider: "gitlab", repo_full_name: null, default_branch: null } : null);

    const context = await readIssuePromptContext(client, ["a", "b", "c"]);

    expect(mocks.getProjectLink).toHaveBeenCalledTimes(2);
    expect(context.a.repository).toBeNull();
    expect(context.c.repository).toBeNull();
  });

  it("returns nothing without reading the forge rows when no issue is visible", async () => {
    mocks.visible = [];
    expect(await readIssuePromptContext(client, ["x"])).toEqual({});
    expect(mocks.listPullRequestsForIssues).not.toHaveBeenCalled();
  });
});
