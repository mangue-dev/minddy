import { describe, expect, it } from "vitest";

import { executionPolicyFor } from "./policy";

describe("executionPolicyFor", () => {
  it("ne change pas les capacites lorsqu'un ticket devient contexte", () => {
    const general = executionPolicyFor({
      hasIssueContext: false,
      reviewingPullRequest: false,
      unattended: false,
    });
    const withIssue = executionPolicyFor({
      hasIssueContext: true,
      reviewingPullRequest: false,
      unattended: false,
    });
    expect(withIssue).toEqual({ ...general, defaultIssueTarget: true });
  });

  it("rend une revue de PR techniquement read-only", () => {
    expect(
      executionPolicyFor({
        hasIssueContext: true,
        reviewingPullRequest: true,
        unattended: false,
      }),
    ).toMatchObject({ repository: "read", projectData: "read", delivery: "none" });
  });

  it("exprime une routine par son interaction et sa livraison", () => {
    expect(
      executionPolicyFor({
        hasIssueContext: false,
        reviewingPullRequest: false,
        unattended: true,
      }),
    ).toMatchObject({ interaction: "unattended", delivery: "auto_pr" });
  });
});

