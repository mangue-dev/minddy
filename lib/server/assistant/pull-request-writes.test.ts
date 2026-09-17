import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The direct PR-management gestures of Numo (MIN-550): merge, rename /
 * re-describe, comment, edit a comment Numo posted itself.
 *
 * The forge is replaced wholesale — what we pin here is the GUARDRAIL work:
 * the merge pre-checks (draft, conflicts, red or running CI), the ownership
 * gate of the comment edit (bot identity on GitHub, Numo signature
 * elsewhere), the signature of Numo's comments, and the after-merge
 * bookkeeping (row + runs + issue status through the shared sync core).
 */

const ISSUE_OK = "11111111-1111-4111-8111-111111111111";
const ISSUE_FOREIGN = "22222222-2222-4222-8222-222222222222";
const PR_ROW_ID = "33333333-3333-4333-8333-333333333333";

const ctx = {
  projectId: "proj-1",
  userId: "user-1",
  model: "test-model",
  locale: "en",
  supabase: {} as never,
};

const { findPullRequest, findPullRequestForIssue, upsertPullRequest } =
  vi.hoisted(() => ({
    findPullRequest: vi.fn(),
    findPullRequestForIssue: vi.fn(),
    upsertPullRequest: vi.fn(),
  }));
const { resolveRepoCloneTarget } = vi.hoisted(() => ({
  resolveRepoCloneTarget: vi.fn(),
}));
const { forgeFor } = vi.hoisted(() => ({ forgeFor: vi.fn() }));
const { syncPrState } = vi.hoisted(() => ({ syncPrState: vi.fn() }));
const { syncIssueStatusFromPr } = vi.hoisted(() => ({
  syncIssueStatusFromPr: vi.fn(),
}));
const { broadcastPrChanged } = vi.hoisted(() => ({ broadcastPrChanged: vi.fn() }));
const { signReviewBody } = vi.hoisted(() => ({
  signReviewBody: (body: string, model: string) =>
    `${body}\n\n---\n🤖 Reviewed by Numo (minddy) · ${model}`,
}));
const { getGithubAppSlug } = vi.hoisted(() => ({
  getGithubAppSlug: () => "minddy-app",
}));
const { assertIssueInProject } = vi.hoisted(() => ({
  assertIssueInProject: vi.fn(async (_db: unknown, issueId: string) =>
    issueId === ISSUE_FOREIGN
      ? { ok: false, error: "Issue not found in this project." }
      : { ok: true },
  ),
}));

vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequest,
  findPullRequestForIssue,
  rowProvider: (row: { provider: string }) => row.provider,
  upsertPullRequest,
}));
vi.mock("@/lib/server/agent/repo-access", () => ({ resolveRepoCloneTarget }));
vi.mock("@/lib/server/agent/forge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/agent/forge")>();
  return { ...actual, forgeFor };
});
vi.mock("@/lib/server/agent/runs", () => ({ syncPrState }));
vi.mock("@/lib/server/agent/issue-status-sync", () => ({ syncIssueStatusFromPr }));
vi.mock("@/lib/server/agent/pr-live", () => ({ broadcastPrChanged }));
vi.mock("@/lib/server/agent/pr-tools", () => ({ signReviewBody }));
vi.mock("@/lib/server/git/github-app", () => ({ getGithubAppSlug }));
vi.mock("@/lib/server/issue-reads", () => ({ assertIssueInProject }));

const { executePullRequestWriteTool } = await import("./pull-request-writes");

const TARGET = {
  provider: "github" as const,
  repoFullName: "acme/app",
  defaultBranch: "main",
  remoteUrl: "https://github.com/acme/app",
  authUrl: "https://x:tok@github.com/acme/app",
  token: "tok",
  linkId: "link-1",
  connectionId: "conn-1",
  externalRepoId: "ext-1",
};

const ROW = {
  id: PR_ROW_ID,
  provider: "github",
  repo_full_name: "acme/app",
  number: 42,
  url: "https://github.com/acme/app/pull/42",
  title: "Old title",
  state: "open" as const,
  author_login: null,
  author_avatar_url: null,
  head_branch: "feature",
  base_branch: "main",
  head_sha: "sha",
  issue_id: ISSUE_OK,
  opened_at: null,
  merged_at: null,
  updated_at: "2026-09-01T00:00:00.000Z",
  synced_at: "2026-09-01T00:00:00.000Z",
};

const forge = {
  provider: "github" as const,
  mergeMethods: ["merge", "squash", "rebase"] as const,
};

function forgeWith(overrides: Partial<Record<string, unknown>>) {
  return { ...forge, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  findPullRequest.mockResolvedValue(ROW);
  findPullRequestForIssue.mockResolvedValue(ROW);
  resolveRepoCloneTarget.mockResolvedValue(TARGET);
  upsertPullRequest.mockResolvedValue(ROW);
  syncPrState.mockResolvedValue([]);
  syncIssueStatusFromPr.mockResolvedValue(undefined);
  broadcastPrChanged.mockReturnValue(undefined);
  forgeFor.mockReturnValue(forge);
});

// ── merge_pull_request ──────────────────────────────────────────────────────

describe("merge_pull_request", () => {
  const pr = (overrides: Record<string, unknown> = {}) => ({
    number: 42,
    url: ROW.url,
    state: "open",
    draft: false,
    merged: false,
    headSha: "sha",
    mergeable: true,
    mergeableState: "clean",
    ...overrides,
  });
  const checks = (state: string | null, failing: string[] = []) => ({
    state,
    passing: state === "success" ? 3 : 0,
    total: 3,
    checks: failing.map((name) => ({
      name,
      state: "failure" as const,
      url: null,
      appName: null,
      appAvatarUrl: null,
      description: null,
      durationMs: null,
    })),
  });
  const run = (args: Record<string, unknown> = {}) =>
    executePullRequestWriteTool(ctx, "merge_pull_request", {
      issue_id: ISSUE_OK,
      ...args,
    });

  it("merges a clean pull request and settles the linked issue to done", async () => {
    forgeFor.mockReturnValue(
      forgeWith({
        getPullRequest: vi.fn().mockResolvedValue(pr()),
        listChecks: vi.fn().mockResolvedValue(checks("success")),
        mergePullRequest: vi.fn().mockResolvedValue(undefined),
      }),
    );

    const { result, success } = await run({ merge_method: "squash" });

    expect(success).toBe(true);
    expect(result).toMatchObject({
      number: 42,
      state: "merged",
      method: "squash",
      issue_status: "done",
    });
    expect(upsertPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        repoFullName: "acme/app",
        number: 42,
        state: "merged",
        issueId: ISSUE_OK,
      }),
    );
    expect(syncPrState).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, prState: "merged" }),
    );
    expect(syncIssueStatusFromPr).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: ISSUE_OK,
        prState: "merged",
        forgeSync: "github",
      }),
    );
  });

  it("refuses a draft, a closed pull request and a conflicting one before calling the forge", async () => {
    for (const [state, fragment] of [
      [pr({ draft: true }), "draft"],
      [pr({ state: "closed" }), "closed"],
      [pr({ mergeable: false, mergeableState: "dirty" }), "conflicts"],
    ] as const) {
      forgeFor.mockReturnValueOnce(
        forgeWith({ getPullRequest: vi.fn().mockResolvedValue(state) }),
      );
      const { result, success } = await run();
      expect(success).toBe(false);
      expect((result as { error: string }).error).toContain(fragment);
    }
    expect(upsertPullRequest).not.toHaveBeenCalled();
  });

  it("refuses a merge against red or running CI checks", async () => {
    for (const [summary, fragment] of [
      [checks("failure", ["build", "lint"]), "build, lint"],
      [checks("pending"), "still running"],
    ] as const) {
      forgeFor.mockReturnValueOnce(
        forgeWith({
          getPullRequest: vi.fn().mockResolvedValue(pr()),
          listChecks: vi.fn().mockResolvedValue(summary),
        }),
      );
      const { result, success } = await run();
      expect(success).toBe(false);
      expect((result as { error: string }).error).toContain(fragment);
    }
  });

  it("merges when the checks are unreadable — the forge keeps the final word", async () => {
    forgeFor.mockReturnValue(
      forgeWith({
        getPullRequest: vi.fn().mockResolvedValue(pr()),
        listChecks: vi.fn().mockRejectedValue(new Error("forbidden")),
        mergePullRequest: vi.fn().mockResolvedValue(undefined),
      }),
    );
    const { success } = await run();
    expect(success).toBe(true);
  });

  it("reports a pull request that is already merged without touching the forge", async () => {
    const mergePullRequest = vi.fn();
    forgeFor.mockReturnValue(
      forgeWith({
        getPullRequest: vi.fn().mockResolvedValue(pr({ merged: true })),
        mergePullRequest,
      }),
    );
    const { result, success } = await run();
    expect(success).toBe(true);
    expect(result).toMatchObject({ state: "merged", note: expect.any(String) });
    expect(mergePullRequest).not.toHaveBeenCalled();
  });

  it("refuses a merge method the forge does not offer", async () => {
    const { result, success } = await run({ merge_method: "rebase_merge" });
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain("merge_method");
  });
});

// ── update_pull_request ─────────────────────────────────────────────────────

describe("update_pull_request", () => {
  it("renames the pull request and keeps the row title in sync", async () => {
    const updatePullRequestTitle = vi
      .fn()
      .mockResolvedValue({ ...ROW, title: "New title" });
    forgeFor.mockReturnValue(
      forgeWith({ updatePullRequestTitle, updatePullRequestBody: vi.fn() }),
    );

    const { result, success } = await executePullRequestWriteTool(
      ctx,
      "update_pull_request",
      { issue_id: ISSUE_OK, title: "New title" },
    );

    expect(success).toBe(true);
    expect(result).toMatchObject({ number: 42, title: "New title" });
    expect(updatePullRequestTitle).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, title: "New title" }),
    );
    expect(upsertPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New title", state: "open" }),
    );
  });

  it("rewrites the description without touching the title", async () => {
    const getPullRequest = vi.fn().mockResolvedValue(ROW);
    const updatePullRequestBody = vi.fn().mockResolvedValue(ROW);
    forgeFor.mockReturnValue(
      forgeWith({ getPullRequest, updatePullRequestBody, updatePullTitle: undefined }),
    );

    const { success } = await executePullRequestWriteTool(ctx, "update_pull_request", {
      issue_id: ISSUE_OK,
      body: "New description",
    });

    expect(success).toBe(true);
    expect(getPullRequest).toHaveBeenCalled();
    expect(updatePullRequestBody).toHaveBeenCalled();
    expect(upsertPullRequest).not.toHaveBeenCalled();
  });

  it("refuses a call without title nor body", async () => {
    const { result, success } = await executePullRequestWriteTool(
      ctx,
      "update_pull_request",
      { issue_id: ISSUE_OK },
    );
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain("title and/or a body");
  });
});

// ── post_pull_request_comment ────────────────────────────────────────────────────

describe("post_pull_request_comment", () => {
  it("posts the comment signed as Numo", async () => {
    const createPullRequestComment = vi
      .fn()
      .mockResolvedValue({ id: 7, html_url: "https://github.com/acme/app/pull/42#issuecomment-7" });
    forgeFor.mockReturnValue(forgeWith({ createPullRequestComment }));

    const { result, success } = await executePullRequestWriteTool(
      ctx,
      "post_pull_request_comment",
      { issue_id: ISSUE_OK, body: "Looks good." },
    );

    expect(success).toBe(true);
    expect(result).toMatchObject({ id: 7 });
    const body = createPullRequestComment.mock.calls[0][0].body as string;
    expect(body).toContain("Looks good.");
    expect(body).toMatch(/🤖 Reviewed by Numo \(minddy\) · test-model/);
  });

  it("refuses an empty body", async () => {
    const { success } = await executePullRequestWriteTool(ctx, "post_pull_request_comment", {
      issue_id: ISSUE_OK,
      body: "   ",
    });
    expect(success).toBe(false);
  });
});

// ── edit_own_pull_request_comment ───────────────────────────────────────────

describe("edit_own_pull_request_comment", () => {
  const run = (comments: unknown[], args: Record<string, unknown>) => {
    forgeFor.mockReturnValue(
      forgeWith({
        listPullRequestComments: vi.fn().mockResolvedValue(comments),
        updatePullRequestComment: vi
          .fn()
          .mockResolvedValue({ id: 7, html_url: "https://u" }),
      }),
    );
    return executePullRequestWriteTool(ctx, "edit_own_pull_request_comment", {
      issue_id: ISSUE_OK,
      ...args,
    });
  };

  it("rewrites a comment Numo authored under its bot identity", async () => {
    const { result, success } = await run(
      [{ id: 7, body: "old", user: { login: "minddy-app[bot]", avatar_url: null }, created_at: "" }],
      { comment_id: 7, body: "new" },
    );
    expect(success).toBe(true);
    expect(result).toMatchObject({ id: 7 });
  });

  it("accepts a GitLab comment recognized by the Numo signature", async () => {
    resolveRepoCloneTarget.mockResolvedValue({ ...TARGET, provider: "gitlab" });
    findPullRequestForIssue.mockResolvedValue({ ...ROW, provider: "gitlab" });
    const { success } = await run(
      [
        {
          id: 7,
          body: "old\n\n---\n🤖 Reviewed by Numo (minddy) · test-model",
          user: { login: "someone", avatar_url: null },
          created_at: "",
        },
      ],
      { comment_id: 7, body: "new" },
    );
    expect(success).toBe(true);
  });

  it("refuses a human comment", async () => {
    const { result, success } = await run(
      [{ id: 7, body: "old", user: { login: "human", avatar_url: null }, created_at: "" }],
      { comment_id: 7, body: "new" },
    );
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain("not posted by you");
  });

  it("refuses an unknown comment id", async () => {
    const { success } = await run([], { comment_id: 7, body: "new" });
    expect(success).toBe(false);
  });

  it("refuses a call without comment_id", async () => {
    const { success } = await run([], { body: "new" });
    expect(success).toBe(false);
  });
});

// ── resolve_pull_request_threads ────────────────────────────────────────────

describe("resolve_pull_request_threads", () => {
  const thread = (rootCommentId: number, threadId: string, resolved: boolean) => ({
    rootCommentId,
    threadId,
    resolved,
    resolvedBy: null,
  });
  const run = (
    threads: unknown[],
    args: Record<string, unknown>,
    overrides: Partial<Record<string, unknown>> = {},
  ) => {
    const listReviewThreads = vi.fn().mockResolvedValue(threads);
    const setReviewThreadResolved = vi.fn().mockResolvedValue(undefined);
    forgeFor.mockReturnValue(
      forgeWith({ listReviewThreads, setReviewThreadResolved, ...overrides }),
    );
    return executePullRequestWriteTool(ctx, "resolve_pull_request_threads", {
      issue_id: ISSUE_OK,
      ...args,
    });
  };

  it("resolves conversations by root comment id, under the installation token", async () => {
    const { result, success } = await run(
      [thread(11, "PRRT_1", false), thread(22, "PRRT_2", false)],
      { comment_ids: [11, 22] },
    );

    expect(success).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      changed: [11, 22],
      unchanged: [],
      unknown: [],
    });
    expect(forgeFor().setReviewThreadResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "tok",
        repoFullName: "acme/app",
        number: 42,
        threadId: "PRRT_1",
        resolved: true,
      }),
    );
    // The PR page follows the change like a human resolution.
    expect(broadcastPrChanged).toHaveBeenCalledWith(PR_ROW_ID, ["reviewComments"]);
  });

  it("reopens with resolved: false", async () => {
    const { result } = await run([thread(22, "PRRT_2", true)], {
      comment_ids: [22],
      resolved: false,
    });
    expect(result).toMatchObject({ resolved: false, changed: [22] });
    expect(forgeFor().setReviewThreadResolved).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "PRRT_2", resolved: false }),
    );
  });

  it("reports conversations already in the target state without touching the forge", async () => {
    const { result, success } = await run(
      [thread(11, "PRRT_1", true)],
      { comment_ids: [11] },
    );
    expect(success).toBe(true);
    expect(result).toMatchObject({ changed: [], unchanged: [11] });
    expect(forgeFor().setReviewThreadResolved).not.toHaveBeenCalled();
    expect(broadcastPrChanged).not.toHaveBeenCalled();
  });

  it("reports unknown ids and fails only when nothing definite happened", async () => {
    const onlyUnknown = await run([], { comment_ids: [99] });
    expect(onlyUnknown.success).toBe(false);
    expect(onlyUnknown.result).toMatchObject({ unknown: [99] });

    const mixed = await run([thread(11, "PRRT_1", false)], {
      comment_ids: [11, 99],
    });
    expect(mixed.success).toBe(true);
    expect(mixed.result).toMatchObject({ changed: [11], unknown: [99] });
  });

  it("lands the rest of the batch when one conversation is refused by the forge", async () => {
    const { GithubApiError } = await import("@/lib/server/agent/pr");
    const setReviewThreadResolved = vi
      .fn()
      .mockRejectedValueOnce(new GithubApiError("thread moved", 422))
      .mockResolvedValueOnce(undefined);
    const { result, success } = await run(
      [thread(11, "PRRT_1", false), thread(22, "PRRT_2", false)],
      { comment_ids: [11, 22] },
      { setReviewThreadResolved },
    );
    expect(success).toBe(true);
    expect(result).toMatchObject({
      changed: [22],
      failed: [{ id: 11, error: expect.stringContaining("422") }],
    });
  });

  it("refuses with a readable error when the conversations are unreadable", async () => {
    const { GithubApiError } = await import("@/lib/server/agent/pr");
    const { result, success } = await run([], { comment_ids: [11] }, {
      listReviewThreads: vi
        .fn()
        .mockRejectedValue(new GithubApiError("forbidden", 403)),
    });
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain("403");
    expect(forgeFor().setReviewThreadResolved).not.toHaveBeenCalled();
  });

  it("refuses a call without root comment ids", async () => {
    const { success } = await run([], {});
    expect(success).toBe(false);
  });

  it("caps the batch at fifty conversations", async () => {
    const refused = await run([], {
      comment_ids: Array.from({ length: 51 }, (_, i) => i + 1),
    });
    expect(refused.success).toBe(false);
    expect((refused.result as { error: string }).error).toContain("At most");
  });
});

// ── Resolution shared with read_pull_request ────────────────────────────────

describe("resolution", () => {
  it("refuses both targets — or none — at once", async () => {
    for (const args of [
      { issue_id: ISSUE_OK, pull_request_id: PR_ROW_ID },
      {},
    ]) {
      const { result, success } = await executePullRequestWriteTool(
        ctx,
        "merge_pull_request",
        args,
      );
      expect(success).toBe(false);
      expect((result as { error: string }).error).toContain(
        "exactly one of issue_id or pull_request_id",
      );
    }
  });

  it("refuses a pull request outside the project's repository", async () => {
    findPullRequest.mockResolvedValue({ ...ROW, repo_full_name: "other/repo" });
    const { result, success } = await executePullRequestWriteTool(
      ctx,
      "merge_pull_request",
      { pull_request_id: PR_ROW_ID },
    );
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain(
      "not available in this project",
    );
  });

  it("refuses an issue of another project before any forge call", async () => {
    const { result, success } = await executePullRequestWriteTool(
      ctx,
      "merge_pull_request",
      { issue_id: ISSUE_FOREIGN },
    );
    expect(success).toBe(false);
    expect((result as { error: string }).error).toContain(
      "not found in this project",
    );
  });
});
