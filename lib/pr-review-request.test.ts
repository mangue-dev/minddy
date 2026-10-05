import { describe, expect, it } from "vitest";

import type { PrViewer, PullRequestRef } from "./agent-api";
import { reviewerReviewGroups, reviewCardTone, viewerReviewIsRequested } from "./pr-review-request";
import type { PrReviewState, PrTimelineEvent } from "./pr-timeline";

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
  it("preserves chronological review history for each reviewer", () => {
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

describe("reviewCardTone", () => {
  function review(id: number, state: PrReviewState, login = "ada"): PrTimelineEvent {
    return {
      id: String(id), kind: "reviewed", actor: { login, avatar_url: null },
      reviewState: state, createdAt: `2026-10-0${id}T10:00:00Z`,
    };
  }

  it.each([
    ["approved", "success"],
    ["changes_requested", "danger"],
  ] as const)("preserves %s after a comment-only review", (verdict, tone) => {
    const timeline = [review(1, verdict, "Ada"), review(2, "commented", "ada")];
    expect(reviewCardTone(timeline, [])).toBe(tone);
    expect(reviewerReviewGroups(timeline)[0].map((event) => event.id)).toEqual(["2", "1"]);
  });

  it("uses the newest decisive verdict even when later comments follow it", () => {
    expect(reviewCardTone([
      review(1, "changes_requested"), review(2, "approved"), review(3, "commented"),
    ], [])).toBe("success");
    expect(reviewCardTone([
      review(1, "approved"), review(2, "changes_requested"), review(3, "commented"),
    ], [])).toBe("danger");
  });

  it("keeps comment-only reviewers and pending requests neutral", () => {
    expect(reviewCardTone([], [])).toBe("neutral");
    expect(reviewCardTone([review(1, "commented")], [])).toBe("neutral");
    expect(reviewCardTone([review(1, "approved")], [{ login: "grace", avatar_url: null }])).toBe("neutral");
    expect(reviewCardTone([review(1, "approved"), review(2, "commented", "grace")], [])).toBe("neutral");
  });

  it("does not reactivate a dismissed review", () => {
    expect(reviewCardTone([review(1, "dismissed"), review(2, "commented")], [])).toBe("neutral");
  });
});
