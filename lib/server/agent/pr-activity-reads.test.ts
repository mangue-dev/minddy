import { describe, expect, it, vi } from "vitest";

import { prCommentsResponse, prReviewCommentsResponse, type PrScope } from "./pr-actions";

/**
 * Reactions of a PR's activity (MIN-889). GitHub reads them from the PR
 * itself, so they no longer wait for the comments; GitLab queries each
 * comment and still needs their ids first.
 */

function scopeFor(provider: "github" | "gitlab", forge: Record<string, unknown>) {
  return {
    target: { provider },
    call: { token: "token", repoFullName: "acme/app", number: 42 },
    actor: async () => ({ kind: "unavailable", reason: "notConfigured", login: null }),
    forge,
  } as unknown as PrScope;
}

describe("pull request activity reads", () => {
  it("reads GitHub conversation reactions while the comments are still loading", async () => {
    let releaseComments!: (value: unknown) => void;
    const listConversationReactions = vi.fn(async () => [{ id: "r" }]);
    const result = prCommentsResponse(scopeFor("github", {
      listPullRequestComments: () => new Promise((resolve) => { releaseComments = resolve; }),
      listTimeline: async () => [],
      listConversationReactions,
    }));
    await vi.waitFor(() => expect(listConversationReactions).toHaveBeenCalledOnce());
    releaseComments([{ id: 7 }]);
    expect((await (await result).json()).reactions).toEqual([{ id: "r" }]);
  });

  it("names every GitLab comment before reading its reactions", async () => {
    const listConversationReactions = vi.fn(async () => []);
    await prCommentsResponse(scopeFor("gitlab", {
      listPullRequestComments: async () => [{ id: 7 }, { id: 9 }],
      listTimeline: async () => [],
      listConversationReactions,
    }));
    expect(listConversationReactions).toHaveBeenCalledWith(expect.objectContaining({
      commentIds: [0, 7, 9],
      viewerIsActor: false,
    }));
  });

  it("reads GitHub review reactions while the review comments are still loading", async () => {
    let releaseComments!: (value: unknown) => void;
    const listReviewCommentReactions = vi.fn(async () => []);
    const result = prReviewCommentsResponse(scopeFor("github", {
      listPullRequestReviewComments: () => new Promise((resolve) => { releaseComments = resolve; }),
      listReviewThreads: async () => [],
      listReviewCommentReactions,
    }));
    await vi.waitFor(() => expect(listReviewCommentReactions).toHaveBeenCalledOnce());
    releaseComments([]);
    expect((await result).status).toBe(200);
  });

  it("skips GitLab review reactions when there is no review comment", async () => {
    const listReviewCommentReactions = vi.fn(async () => []);
    const response = await prReviewCommentsResponse(scopeFor("gitlab", {
      listPullRequestReviewComments: async () => [],
      listReviewThreads: async () => [],
      listReviewCommentReactions,
    }));
    expect((await response.json()).reactions).toEqual([]);
    expect(listReviewCommentReactions).not.toHaveBeenCalled();
  });
});
