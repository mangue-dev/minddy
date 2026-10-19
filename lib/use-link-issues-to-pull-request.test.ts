import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { linkIssuesToPullRequest, optimisticIssuePrs, unlinkIssuesFromPullRequests } from "./use-link-issues-to-pull-request";

describe("linkIssuesToPullRequest", () => {
  it("links each issue on its own, so one refusal never blocks the others", async () => {
    const link = vi.fn(async (_prId: string, issueId: string) => {
      if (issueId === "busy") throw new Error("This issue already has a pull request.");
      return { ok: true as const, issue: { id: issueId, number: 1, title: "" }, status: null };
    });
    const outcome = await linkIssuesToPullRequest(
      ["a", "busy", "b"],
      { prId: "pr", prNumber: 447, state: "open" },
      link,
    );
    expect(link).toHaveBeenCalledTimes(3);
    expect(outcome.linked).toEqual(["a", "b"]);
    expect(outcome.failed).toEqual([{ issueId: "busy", message: "This issue already has a pull request." }]);
  });
});

describe("unlinkIssuesFromPullRequests", () => {
  it("removes every link of each issue and reports failures per issue", async () => {
    const unlink = vi.fn(async (prId: string, issueId: string) => {
      if (issueId === "locked") throw new Error("Read-only project.");
      return { ok: true as const };
    });
    const outcome = await unlinkIssuesFromPullRequests(
      [{ issueId: "a", prIds: ["pr-1", "pr-2"] }, { issueId: "none", prIds: [] }, { issueId: "locked", prIds: ["pr-3"] }],
      unlink,
    );
    expect(unlink.mock.calls).toEqual([["pr-1", "a"], ["pr-2", "a"], ["pr-3", "locked"]]);
    expect(outcome.linked).toEqual(["a"]);
    expect(outcome.failed).toEqual([{ issueId: "locked", message: "Read-only project." }]);
  });
});

describe("optimisticIssuePrs", () => {
  const payload = {
    pullRequests: { a: { prId: "pr-1", prNumber: 1, state: "merged" as const } },
    linkedPullRequestIds: { a: ["pr-1"] },
  };

  it("shows the new pull request on every linked card at once", () => {
    const next = optimisticIssuePrs(payload, { link: { prId: "pr-9", prNumber: 9, state: "open" }, issueIds: ["a", "b"] });
    expect(next?.pullRequests?.b).toEqual({ prId: "pr-9", prNumber: 9, state: "open" });
    expect(next?.linkedPullRequestIds?.a).toEqual(["pr-1", "pr-9"]);
    // The cached object is never mutated.
    expect(payload.pullRequests).not.toHaveProperty("b");
  });

  it("clears the chips of unlinked cards", () => {
    const next = optimisticIssuePrs(payload, { unlinkIssueIds: ["a"] });
    expect(next?.pullRequests).toEqual({});
    expect(next?.linkedPullRequestIds).toEqual({});
  });
});
