import { describe, expect, it, vi } from "vitest";

import { prDetailResponse, type PrScope } from "./pr-actions";

describe("pull request detail deployment", () => {
  it("resolves the deployment from the live forge head", async () => {
    const getLatestSuccessfulDeploymentUrl = vi
      .fn()
      .mockResolvedValue("https://preview.example.com/live");
    const listChecks = vi.fn().mockResolvedValue({
      checks: [],
      state: "success",
      passing: 0,
      total: 0,
      startedAt: null,
      completedAt: null,
    });
    const scope = {
      pr: { head_sha: "stored-head" },
      target: { provider: "gitlab" },
      call: { token: "token", repoFullName: "acme/app", number: 42 },
      actor: async () => ({ kind: "unavailable", reason: "notConfigured", login: null }),
      forge: {
        getPullRequest: async () => ({
          number: 42,
          url: "https://gitlab.example.com/acme/app/-/merge_requests/42",
          state: "open",
          headSha: "live-head",
        }),
        listPullRequestFiles: async () => ({ files: [], truncated: false }),
        listReviews: async () => null,
        listReviewThreads: async () => null,
        listChecks,
        getLatestSuccessfulDeploymentUrl,
      },
    } as unknown as PrScope;

    const response = await prDetailResponse(scope);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBe("https://preview.example.com/live");
    expect(getLatestSuccessfulDeploymentUrl).toHaveBeenCalledWith({
      token: "token",
      repoFullName: "acme/app",
      sha: "live-head",
    });
    expect(listChecks).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "live-head" }),
    );
  });
});
