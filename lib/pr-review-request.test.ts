import { describe, expect, it } from "vitest";

import type { PrViewer, PullRequestRef } from "./agent-api";
import { reviewerReviewGroups, viewerReviewIsRequested } from "./pr-review-request";

const viewer: PrViewer = {
  provider: "github",
  configured: true,
  connected: true,
  login: "mangue-dev",
  capability: "write",
};

const pullRequest: PullRequestRef = {
  number: 110,
  url: "https://github.com/mangue-dev/minddy/pull/110",
  state: "open",
  requestedReviewers: [{ login: "Mangue-Dev", avatar_url: null }],
};

describe("viewerReviewIsRequested", () => {
  it("matches a pending review request to the connected forge account", () => {
    expect(viewerReviewIsRequested(pullRequest, viewer)).toBe(true);
  });

  it("ignores requests after the pull request becomes terminal", () => {
    expect(viewerReviewIsRequested({ ...pullRequest, state: "closed" }, viewer)).toBe(false);
    expect(viewerReviewIsRequested({ ...pullRequest, merged: true }, viewer)).toBe(false);
  });

  it("does not infer a request without a matching viewer login", () => {
    expect(viewerReviewIsRequested(pullRequest, { ...viewer, login: "someone-else" })).toBe(false);
    expect(viewerReviewIsRequested(pullRequest, null)).toBe(false);
  });
});


describe("reviewerReviewGroups", () => {
  it("preserves review history while using the latest verdict for each reviewer", () => {
    const timeline: import("./pr-timeline").PrTimelineEvent[] = [
      {
        id: "old",
        kind: "reviewed",
        actor: { login: "Ada", avatar_url: null },
        reviewState: "changes_requested",
        createdAt: "2026-10-01T10:00:00Z",
      },
      { id: "request", kind: "review_requested", actor: null, createdAt: null },
      {
        id: "new",
        kind: "reviewed",
        actor: { login: "ada", avatar_url: null },
        reviewState: "approved",
        createdAt: "2026-10-02T10:00:00Z",
      },
      {
        id: "other",
        kind: "reviewed",
        actor: { login: "Grace", avatar_url: null },
        reviewState: "commented",
        createdAt: null,
      },
    ];
    expect(
      reviewerReviewGroups(timeline).map((group) =>
        group.map((review) => review.id),
      ),
    ).toEqual([["new", "old"], ["other"]]);
    expect(timeline[0].id).toBe("old");
    expect(reviewerReviewGroups([])).toEqual([]);
  });
});
