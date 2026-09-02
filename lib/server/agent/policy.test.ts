import { describe, expect, it } from "vitest";

import { executionPolicyFor } from "./policy";

describe("executionPolicyFor", () => {
  it("keeps capabilities identical across anchors and triggers", () => {
    const combinations = [
      {
        hasIssueContext: false,
        reviewingPullRequest: false,
        unattended: false,
      },
      { hasIssueContext: true, reviewingPullRequest: false, unattended: false },
      { hasIssueContext: false, reviewingPullRequest: true, unattended: false },
      { hasIssueContext: false, reviewingPullRequest: false, unattended: true },
    ];

    for (const input of combinations) {
      expect(executionPolicyFor(input)).toMatchObject({
        interaction: "interactive",
        repository: "write",
        projectData: "write",
      });
    }
  });

  it("keeps delivery and implicit issue targeting as metadata", () => {
    expect(
      executionPolicyFor({
        hasIssueContext: true,
        reviewingPullRequest: false,
        unattended: true,
      }),
    ).toMatchObject({ defaultIssueTarget: true, delivery: "auto_pr" });
  });
});
