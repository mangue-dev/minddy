import { describe, expect, it } from "vitest";

import { refineGithubMergeabilityReason } from "./pr";

describe("GitHub mergeability refinement", () => {
  it("preserves merge conflicts when a review is also required", () => {
    expect(
      refineGithubMergeabilityReason("conflicts", "REVIEW_REQUIRED"),
    ).toBe("conflicts");
    expect(
      refineGithubMergeabilityReason("conflicts", "CHANGES_REQUESTED"),
    ).toBe("conflicts");
  });

  it("refines a generic policy refusal with the review decision", () => {
    expect(refineGithubMergeabilityReason("policy", "REVIEW_REQUIRED")).toBe(
      "approval_required",
    );
    expect(
      refineGithubMergeabilityReason("policy", "CHANGES_REQUESTED"),
    ).toBe("changes_requested");
  });
});
