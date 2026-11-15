import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * list_pull_requests (MIN-1004): Numo finds a pull request from any page,
 * including one attached to no issue. Pinned here: the project's repository
 * scope, the catch-up of a stale repository before the read, the state and
 * text filters, and the attached issues rendered as identifiers.
 */

const {
  listPullRequestsForUser,
  needsRepoSync,
  readRepoSyncStates,
  repoForProject,
  sweepRepo,
} = vi.hoisted(() => ({
  listPullRequestsForUser: vi.fn(),
  needsRepoSync: vi.fn(),
  readRepoSyncStates: vi.fn(),
  repoForProject: vi.fn(),
  sweepRepo: vi.fn(),
}));

vi.mock("@/lib/server/agent/pull-requests", () => ({
  listPullRequestsForUser,
  needsRepoSync,
  readRepoSyncStates,
  repoForProject,
  repoSyncKey: (provider: string, name: string) => `${provider}:${name}`,
}));
vi.mock("@/lib/server/agent/pull-requests-sweep", () => ({ sweepRepo }));

const { listProjectPullRequests } = await import("./pull-request-list");

const REPO = { provider: "github" as const, repoFullName: "acme/app" };
const ctx = { projectId: "proj-1", userId: "user-1", supabase: {} as never };

function row(number: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `pr-${number}`,
    provider: "github",
    repo_full_name: "acme/app",
    number,
    url: `https://github.com/acme/app/pull/${number}`,
    title: `PR ${number}`,
    state: "open",
    author_login: "camille",
    head_branch: `feature-${number}`,
    base_branch: "main",
    updated_at: "2026-11-15T00:00:00.000Z",
    issues: [],
    issue: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoForProject.mockResolvedValue(REPO);
  readRepoSyncStates.mockResolvedValue(new Map());
  needsRepoSync.mockReturnValue(false);
  sweepRepo.mockResolvedValue(false);
  listPullRequestsForUser.mockResolvedValue([]);
});

describe("list_pull_requests", () => {
  it("lists the open pull requests of the linked repository, unlinked ones included", async () => {
    listPullRequestsForUser.mockResolvedValue([
      row(42),
      row(41, {
        state: "draft",
        issues: [{ id: "issue-7", number: 7, title: "Login", status: "in_progress", project_id: "proj-1", project_key: "MIN" }],
      }),
    ]);

    const { result, success } = await listProjectPullRequests(ctx, {});

    expect(success).toBe(true);
    expect(listPullRequestsForUser).toHaveBeenCalledWith(ctx.supabase, [REPO], {
      limit: 21,
      states: ["open", "draft"],
    });
    expect(result).toMatchObject({
      repository: "acme/app",
      state: "open",
      count: 2,
      has_more: false,
      pull_requests: [
        { id: "pr-42", number: 42, state: "open", issues: [] },
        { id: "pr-41", number: 41, state: "draft", issues: [{ id: "issue-7", identifier: "MIN-7", status: "in_progress" }] },
      ],
    });
  });

  it("catches a stale repository up at the forge before reading it", async () => {
    const previous = { provider: "github", repo_full_name: "acme/app", synced_at: "2026-11-15T00:00:00.000Z", truncated: false };
    readRepoSyncStates.mockResolvedValue(new Map([["github:acme/app", previous]]));
    needsRepoSync.mockReturnValue(true);

    await listProjectPullRequests(ctx, {});

    expect(sweepRepo).toHaveBeenCalledWith("user-1", REPO, previous);
    expect(sweepRepo.mock.invocationCallOrder[0]).toBeLessThan(
      listPullRequestsForUser.mock.invocationCallOrder[0],
    );
  });

  it("skips the forge while the last sweep is fresh", async () => {
    await listProjectPullRequests(ctx, {});
    expect(sweepRepo).not.toHaveBeenCalled();
  });

  it("filters by state and text, and reports more rows past the limit", async () => {
    listPullRequestsForUser.mockResolvedValue([
      row(3, { state: "merged", title: "Fix login redirect" }),
      row(2, { state: "merged", head_branch: "login-cookie" }),
      row(1, { state: "merged", title: "Docs" }),
    ]);

    const { result } = await listProjectPullRequests(ctx, { state: "merged", query: "LOGIN", limit: 1 });

    expect(listPullRequestsForUser).toHaveBeenCalledWith(ctx.supabase, [REPO], {
      limit: 201,
      states: ["merged"],
    });
    expect(result).toMatchObject({ count: 1, has_more: true, pull_requests: [{ number: 3 }] });
  });

  it("reads every state with all, and falls back to open on an unknown one", async () => {
    await listProjectPullRequests(ctx, { state: "all" });
    expect(listPullRequestsForUser).toHaveBeenLastCalledWith(ctx.supabase, [REPO], { limit: 21, states: undefined });

    await listProjectPullRequests(ctx, { state: "everything", limit: 500 });
    expect(listPullRequestsForUser).toHaveBeenLastCalledWith(ctx.supabase, [REPO], { limit: 51, states: ["open", "draft"] });
  });

  it("says so when the project links no repository", async () => {
    repoForProject.mockResolvedValue(null);

    const { result, success } = await listProjectPullRequests(ctx, {});

    expect(success).toBe(false);
    expect(result).toEqual({ error: "This project has no linked repository." });
    expect(listPullRequestsForUser).not.toHaveBeenCalled();
  });
});
