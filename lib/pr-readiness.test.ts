import { describe, expect, it } from "vitest";

import {
  blockerFallbackUrl,
  mapGithubMergePolicy,
  mapGitlabMergePolicy,
  reducePullRequestReadiness,
  type ReadinessInput,
} from "./pr-readiness";

const policy = mapGithubMergePolicy(
  { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: true },
  {
    required_status_checks: { strict: true, contexts: ["test"] },
    required_pull_request_reviews: {
      required_approving_review_count: 2,
      require_code_owner_reviews: true,
    },
    required_conversation_resolution: { enabled: true },
  },
);

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    state: "open",
    merged: false,
    draft: false,
    mergeabilityReason: "clean",
    policy,
    checks: [{ name: "test", state: "success", required: true }],
    checksStatus: "loaded",
    approvals: 2,
    changesRequested: 0,
    reviewThreads: [],
    canWrite: true,
    mergeFlowActive: false,
    ...overrides,
  };
}

describe("reducePullRequestReadiness", () => {
  it("enables only the repository methods when every required condition is satisfied", () => {
    expect(reducePullRequestReadiness(input())).toMatchObject({
      state: "ready",
      mergeAllowed: true,
      methods: ["squash", "rebase"],
      preferredMethod: "squash",
    });
  });

  it("keeps simultaneous blockers instead of collapsing the provider refusal", () => {
    const readiness = reducePullRequestReadiness(
      input({
        mergeabilityReason: "approval_required",
        approvals: 0,
        changesRequested: 1,
        reviewThreads: [
          { rootCommentId: 1, threadId: "thread", resolved: false, resolvedBy: null },
        ],
      }),
    );
    expect(readiness.state).toBe("changes_requested");
    expect(readiness.blockers.map((blocker) => blocker.kind)).toEqual([
      "changes_requested",
      "approvals",
      "conversations",
    ]);
    expect(readiness.mergeAllowed).toBe(false);
  });

  it("keeps the aggregate pending while a required failure is already visible", () => {
    const readiness = reducePullRequestReadiness(
      input({
        mergeabilityReason: "checks",
        checks: [
          { name: "test", state: "failure", required: true },
          { name: "build", state: "pending", required: true },
        ],
      }),
    );
    expect(readiness.state).toBe("checks_running");
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "checks-pending", status: "pending" }),
        expect.objectContaining({ id: "checks-failed", status: "blocked" }),
      ]),
    );
  });

  it("never presents computing or unavailable mergeability as ready", () => {
    expect(reducePullRequestReadiness(input({ mergeabilityReason: "checking" }))).toMatchObject({
      state: "status_unavailable",
      mergeAllowed: false,
    });
    expect(reducePullRequestReadiness(input({ policy: null }))).toMatchObject({
      state: "status_unavailable",
      mergeAllowed: false,
    });
  });
});

describe("provider merge policy mapping", () => {
  it("maps GitHub method and branch-protection settings", () => {
    expect(policy).toMatchObject({
      methods: ["squash", "rebase"],
      requiredApprovals: 2,
      checksMustPass: true,
      requiredCheckNames: ["test"],
      branchMustBeUpToDate: true,
    });
  });

  it("preserves GitLab project strategy and squash preference", () => {
    expect(
      mapGitlabMergePolicy({
        merge_method: "ff",
        squash_option: "default_off",
        only_allow_merge_if_pipeline_succeeds: true,
        only_allow_merge_if_all_discussions_are_resolved: true,
      }),
    ).toMatchObject({
      methods: ["merge", "squash"],
      preferredMethod: "merge",
      checksMustPass: true,
      conversationsMustBeResolved: true,
      linearHistoryRequired: true,
    });
  });
});

describe("provider fallback links", () => {
  it("links directly to the provider surface that can clear the blocker", () => {
    expect(
      blockerFallbackUrl("github", "https://github.com/acme/repo/pull/42", {
        kind: "conversations",
      }),
    ).toBe("https://github.com/acme/repo/pull/42/files");
    expect(
      blockerFallbackUrl("gitlab", "https://gitlab.com/acme/repo/-/merge_requests/42", {
        kind: "checks",
      }),
    ).toBe("https://gitlab.com/acme/repo/-/merge_requests/42/pipelines");
  });
});
