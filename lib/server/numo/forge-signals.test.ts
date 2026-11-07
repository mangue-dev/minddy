import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  links: [] as Array<{ issue_id: string; issues: { project_id: string } }>,
  index: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/git/forge-members", () => ({ buildForgeAssigneeIndex: h.index }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: h.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => Promise.resolve({ data: h.links, error: null }),
      };
      return q;
    },
  }),
}));

const { addedGitlabReviewers, journalPullRequestSignal, signalRecipients } = await import("./forge-signals");

const pullRequest = { id: "pr-1", author_login: "Author" };

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  h.index.mockReset().mockResolvedValue(new Map([["reviewer", "user-r"], ["author", "user-a"]]));
  h.links = [{ issue_id: "issue-1", issues: { project_id: "project-1" } }, { issue_id: "issue-2", issues: { project_id: "project-1" } }];
});

describe("who a pull request signal is for", () => {
  const index = new Map([["reviewer", "user-r"], ["author", "user-a"]]);

  it("addresses a review request to the mapped reviewers, case-insensitively", () => {
    expect(signalRecipients({ provider: "github", pullRequest, type: "pr_review_requested", reviewerLogins: ["Reviewer", "stranger"] }, index))
      .toEqual(["user-r"]);
  });

  it("addresses failing CI to the pull request's author", () => {
    expect(signalRecipients({ provider: "github", pullRequest, type: "pr_checks_failed" }, index)).toEqual(["user-a"]);
  });

  it("tells every member when nobody maps, such as a team review request", () => {
    expect(signalRecipients({ provider: "github", pullRequest, type: "pr_review_requested", reviewerLogins: [] }, index)).toEqual([null]);
    expect(signalRecipients({ provider: "github", pullRequest: { id: "pr-1", author_login: null }, type: "pr_checks_failed" }, index)).toEqual([null]);
  });

  it("reads only the reviewers a GitLab update added", () => {
    expect(addedGitlabReviewers({ reviewers: { previous: [{ username: "a" }], current: [{ username: "a" }, { username: "b" }] } })).toEqual(["b"]);
    expect(addedGitlabReviewers(undefined)).toEqual([]);
  });
});

describe("journaling a pull request signal", () => {
  it("writes one row per linked issue, reading each project's members once", async () => {
    const written = await journalPullRequestSignal({ provider: "github", pullRequest, type: "pr_checks_failed", headSha: "abc" });
    expect(written).toBe(2);
    expect(h.index).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls.map(([, args]) => args)).toEqual([
      { p_issue_id: "issue-1", p_pull_request_id: "pr-1", p_type: "pr_checks_failed", p_head_sha: "abc", p_recipient_id: "user-a" },
      { p_issue_id: "issue-2", p_pull_request_id: "pr-1", p_type: "pr_checks_failed", p_head_sha: "abc", p_recipient_id: "user-a" },
    ]);
  });

  it("counts only rows the database did not already have", async () => {
    h.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await journalPullRequestSignal({ provider: "github", pullRequest, type: "pr_checks_failed", headSha: "abc" })).toBe(1);
  });

  it("never fails the webhook: a database error is logged and nothing is written", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await journalPullRequestSignal({ provider: "github", pullRequest, type: "pr_review_requested", reviewerLogins: ["reviewer"] })).toBe(0);
    expect(log).toHaveBeenCalled();
  });

  it("does nothing for a pull request linked to no issue", async () => {
    h.links = [];
    expect(await journalPullRequestSignal({ provider: "github", pullRequest, type: "pr_checks_failed" })).toBe(0);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
