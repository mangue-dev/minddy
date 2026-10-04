import { describe, expect, it, vi } from "vitest";

import { prDetailResponse, type PrScope } from "./pr-actions";

describe("pull request detail deployment", () => {
  it("starts independent forge reads together while preserving policy-before-checks", async () => {
    let releaseReviews!: (value: null) => void;
    let releasePolicy!: (value: unknown) => void;
    const reviews = new Promise<null>((resolve) => { releaseReviews = resolve; });
    const policy = new Promise((resolve) => { releasePolicy = resolve; });
    const listReviews = vi.fn(() => reviews);
    const getRepositoryMergePolicy = vi.fn(() => policy);
    const listChecks = vi.fn(async () => ({ checks: [], deploymentUrl: null }));
    const getPullRequestDeployment = vi.fn(async () => ({ status: "none" }));
    const listPullRequestFiles = vi.fn(async () => ({ files: [], truncated: false }));
    const scope = {
      target: { provider: "gitlab" },
      call: { token: "token", repoFullName: "acme/app", number: 42 },
      actor: async () => ({ kind: "unavailable", reason: "notConfigured", login: null }),
      forge: {
        getPullRequest: async () => ({ state: "open", base: "main", headSha: "live-head" }),
        listReviews, getRepositoryMergePolicy, listChecks, getPullRequestDeployment, listPullRequestFiles,
        listReviewThreads: async () => null,
      },
    } as unknown as PrScope;
    const result = prDetailResponse(scope);
    await vi.waitFor(() => {
      expect(listReviews).toHaveBeenCalledOnce();
      expect(getRepositoryMergePolicy).toHaveBeenCalledOnce();
      expect(getPullRequestDeployment).toHaveBeenCalledOnce();
      expect(listPullRequestFiles).toHaveBeenCalledOnce();
    });
    expect(listChecks).not.toHaveBeenCalled();
    releasePolicy({ methods: [], requiredCheckNames: ["build"], checksMustPass: true });
    await vi.waitFor(() => expect(listChecks).toHaveBeenCalledWith(expect.objectContaining({
      sha: "live-head", requiredCheckNames: ["build"], checksRequired: true,
    })));
    releaseReviews(null);
    expect((await result).status).toBe(200);
  });

  it("resolves the deployment from the live forge head", async () => {
    const getPullRequestDeployment = vi
      .fn()
      .mockResolvedValue({
        status: "success",
        url: "https://preview.example.com/live",
        startedAt: null,
        durationMs: 124_000,
      });
    const listChecks = vi.fn().mockResolvedValue({
      checks: [],
      deploymentUrl: null,
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
          head: "feature/preview",
          headFromBaseRepository: true,
          headSha: "live-head",
        }),
        listPullRequestFiles: async () => ({ files: [], truncated: false }),
        listReviews: async () => null,
        listReviewThreads: async () => null,
        listChecks,
        getPullRequestDeployment,
      },
    } as unknown as PrScope;

    const response = await prDetailResponse(scope);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deploymentUrl).toBe("https://preview.example.com/live");
    expect(getPullRequestDeployment).toHaveBeenCalledWith({
      token: "token",
      repoFullName: "acme/app",
      number: 42,
      branch: "feature/preview",
      sha: "live-head",
    });
    expect(listChecks).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "live-head" }),
    );
  });

  it("prefers a stable preview advertised by a successful check", async () => {
    const scope = {
      pr: { head_sha: "stored-head" },
      target: { provider: "github" },
      call: { token: "token", repoFullName: "acme/app", number: 42 },
      actor: async () => ({ kind: "unavailable", reason: "notConfigured", login: null }),
      forge: {
        getPullRequest: async () => ({
          number: 42,
          url: "https://github.com/acme/app/pull/42",
          state: "open",
          head: "feature/preview",
          headFromBaseRepository: true,
          headSha: "live-head",
        }),
        listPullRequestFiles: async () => ({ files: [], truncated: false }),
        listReviews: async () => null,
        listReviewThreads: async () => null,
        listChecks: async () => ({
          checks: [],
          deploymentUrl: "https://feature-preview.example.com/",
          state: "success",
          passing: 0,
          total: 0,
          startedAt: null,
          completedAt: null,
        }),
        getPullRequestDeployment: async () => ({
              status: "success",
              url: "https://immutable-commit.example.com/",
              startedAt: null,
              durationMs: null,
            }),
      },
    } as unknown as PrScope;

    const response = await prDetailResponse(scope);
    const body = await response.json();

    expect(body.deploymentUrl).toBe("https://feature-preview.example.com/");
  });

  it("does not look up an unqualified branch name for a fork pull request", async () => {
    const getPullRequestDeployment = vi
      .fn()
      .mockResolvedValue({
        status: "success",
        url: "https://immutable-head.example.com/",
        startedAt: null,
        durationMs: 84_000,
      });
    const scope = {
      pr: { head_sha: "stored-head" },
      target: { provider: "github" },
      call: { token: "token", repoFullName: "acme/app", number: 42 },
      actor: async () => ({ kind: "unavailable", reason: "notConfigured", login: null }),
      forge: {
        getPullRequest: async () => ({
          number: 42,
          url: "https://github.com/acme/app/pull/42",
          state: "open",
          head: "main",
          headFromBaseRepository: false,
          headSha: "fork-head",
        }),
        listPullRequestFiles: async () => ({ files: [], truncated: false }),
        listReviews: async () => null,
        listReviewThreads: async () => null,
        listChecks: async () => ({
          checks: [],
          deploymentUrl: null,
          state: "success",
          passing: 0,
          total: 0,
          startedAt: null,
          completedAt: null,
        }),
        getPullRequestDeployment,
      },
    } as unknown as PrScope;

    const response = await prDetailResponse(scope);
    const body = await response.json();

    expect(body.deploymentUrl).toBe("https://immutable-head.example.com/");
    expect(getPullRequestDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ branch: undefined, sha: "fork-head" }),
    );
  });
});
