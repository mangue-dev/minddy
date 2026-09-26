import { describe, expect, it } from "vitest";

import type { ChecksSummary, PullRequestReviewComment } from "./agent-api";
import { buildPullRequestFixPrompt } from "./pr-fix-prompt";

function checksOf(
  entries: { name: string; state: string; description?: string | null }[],
): ChecksSummary {
  return {
    checks: entries.map((entry) => ({
      name: entry.name,
      state: entry.state as ChecksSummary["checks"][number]["state"],
      url: null,
      appName: null,
      appAvatarUrl: null,
      description: entry.description ?? null,
      durationMs: null,
      startedAt: null,
      completedAt: null,
      required: null,
      rerunRef: null,
    })),
    deploymentUrl: null,
    state: "failure",
    passing: 0,
    total: entries.length,
    startedAt: null,
    completedAt: null,
  };
}

describe("buildPullRequestFixPrompt", () => {
  it("asks the agent to find and fix what is wrong, with the PR metadata", () => {
    const prompt = buildPullRequestFixPrompt(
      {
        number: 42,
        title: "Add the fix card",
        url: "https://github.com/acme/app/pull/42",
        base: "main",
        head: "fix-card",
      },
      null,
    );
    expect(prompt).toContain(
      "Identify what is going wrong on this pull request and fix it.",
    );
    expect(prompt).toContain("Pull request: #42 — Add the fix card");
    expect(prompt).toContain("URL: https://github.com/acme/app/pull/42");
    expect(prompt).toContain("Base branch: main");
    expect(prompt).toContain("Head branch: fix-card");
    expect(prompt).not.toContain("checks are failing");
  });

  it("names the failing checks when the forge reported them", () => {
    const prompt = buildPullRequestFixPrompt(
      { number: 7, title: "", url: null, base: "main", head: "pr" },
      checksOf([
        { name: "build", state: "failure", description: "tsc failed" },
        { name: "lint", state: "success" },
        { name: "e2e", state: "failure" },
      ]),
    );
    expect(prompt).toContain("The following checks are failing:");
    expect(prompt).toContain("- build — tsc failed");
    expect(prompt).toContain("- e2e");
    expect(prompt).not.toContain("lint");
    expect(prompt).toContain("run the smallest relevant checks until they pass");
  });

  it("falls back to the number when the PR has no title", () => {
    const prompt = buildPullRequestFixPrompt(
      { number: 7, title: "   ", url: null, base: null, head: null },
      null,
    );
    expect(prompt).toContain("Pull request: #7 — Pull request #7");
    expect(prompt).not.toContain("URL:");
  });

  it("spells out the unresolved review conversations and the out-of-date branch", () => {
    const root = {
      id: 11,
      in_reply_to_id: null,
      created_at: "2026-09-01T00:00:00Z",
      path: "src/app.tsx",
      line: 12,
      original_line: 12,
      body: "Fix the loop",
      user: { login: "ada", avatar_url: null },
    } as PullRequestReviewComment;
    const prompt = buildPullRequestFixPrompt(
      { number: 9, title: "Review stories", url: null, base: "main", head: "pr" },
      null,
      {
        unresolvedThreads: [
          {
            id: 1,
            root,
            comments: [],
            resolution: {
              rootCommentId: 11,
              threadId: "PRRT_1",
              resolved: false,
              resolvedBy: null,
              outdated: true,
            },
          },
        ],
        branchOutOfDate: true,
      },
    );
    expect(prompt).toContain(
      "The following review conversations are still unresolved",
    );
    expect(prompt).toContain("Conversation 1 on src/app.tsx:12");
    expect(prompt).toContain("(outdated code context)");
    expect(prompt).toContain("The head branch is behind its base branch");
  });

  it("stays silent about conversations and the branch when the card knows neither", () => {
    const prompt = buildPullRequestFixPrompt(
      { number: 9, title: "Review stories", url: null, base: "main", head: "pr" },
      null,
    );
    expect(prompt).not.toContain("review conversations");
    expect(prompt).not.toContain("head branch is behind");
  });
});
