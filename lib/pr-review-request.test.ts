import { describe, expect, it } from "vitest";

import type { PrViewer, PullRequestRef } from "./agent-api";
import { viewerReviewIsRequested } from "./pr-review-request";

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
