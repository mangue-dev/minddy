import { afterEach, describe, expect, it, vi } from "vitest";

import { getPullRequestDeployment as getGithubDeploymentUrl } from "./pr";
import { getPullRequestDeployment as getGitlabDeploymentUrl } from "./mr";

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pull request deployment URLs", () => {
  it("returns the stable Vercel branch URL, dated by the deployment walk", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) {
        return json([
          {
            id: 1,
            body:
              "| minddy | ![Ready](https://vercel.com/ready.svg) [Ready](https://vercel.com/acme/app/deployment) | [Preview](https://app-git-feature-preview-acme.vercel.app) | now |",
            user: { login: "vercel[bot]", type: "Bot" },
            created_at: "2026-09-03T10:00:00Z",
            html_url: "https://github.com/acme/app/pull/42#issuecomment-1",
          },
        ]);
      }
      if (url.includes("/deployments?ref=feature%2Fpreview")) {
        return json([{ id: 5, created_at: "2026-09-03T09:58:00Z" }]);
      }
      if (url.includes("/deployments/5/statuses")) {
        return json([
          {
            state: "success",
            environment_url: "https://commit.example.com",
            created_at: "2026-09-03T10:00:00Z",
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toEqual({
      status: "success",
      url: "https://app-git-feature-preview-acme.vercel.app/",
      startedAt: null,
      durationMs: 120_000,
    });
  });

  it("ignores branch URLs outside an official ready Vercel bot row", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) {
        return json([
          {
            body:
              "| app | ![Ready](https://vercel.com/ready.svg) [Ready](https://vercel.com/acme/app/deployment) | [Preview](https://untrusted.example.com) | now |",
            user: { login: "vercel[bot]", type: "User" },
          },
          {
            body:
              "| app | ![Building](https://vercel.com/building.svg) [Building](https://vercel.com/acme/app/deployment) | [Preview](https://pending.example.com) | now |",
            user: { login: "vercel[bot]", type: "Bot" },
          },
        ]);
      }
      if (url.includes("ref=feature%2Fpreview")) return json([]);
      if (url.includes("sha=abc")) return json([{ id: 1 }]);
      return json([{ state: "success", environment_url: "https://commit.example.com" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "success", url: "https://commit.example.com/", startedAt: null, durationMs: null });
  });

  it("returns the newest successful GitHub branch environment URL", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) return json([]);
      if (url.includes("/deployments?")) {
        return json([
          { id: 10, created_at: "2026-09-02T10:00:00Z" },
          { id: 30, created_at: "2026-09-02T12:00:00Z" },
          { id: 20, created_at: "2026-09-02T11:00:00Z" },
        ]);
      }
      if (url.includes("/deployments/30/statuses")) {
        return json([{ state: "failure", environment_url: "https://failed.example.com" }]);
      }
      if (url.includes("/deployments/20/statuses")) {
        return json([{ state: "success", environment_url: "https://preview.example.com/pr-42" }]);
      }
      return json([{ state: "success", environment_url: "https://older.example.com" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "abc 123",
      }),
    ).resolves.toEqual({ status: "success", url: "https://preview.example.com/pr-42", startedAt: null, durationMs: null });

    const deploymentCall = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes("/deployments?"));
    expect(deploymentCall).toContain("ref=feature%2Fpreview");
  });

  it("falls back to the GitHub head when the branch has no usable deployment", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) return json([]);
      if (url.includes("ref=feature%2Fpreview")) return json([{ id: 2 }]);
      if (url.includes("sha=abc")) return json([{ id: 1 }]);
      if (url.includes("/deployments/2/statuses")) return json([{ state: "failure" }]);
      return json([{ state: "success", environment_url: "https://commit.example.com" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "success", url: "https://commit.example.com/", startedAt: null, durationMs: null });

    const listCalls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/deployments?"));
    expect(listCalls).toHaveLength(2);
    expect(listCalls[0]).toContain("ref=feature%2Fpreview");
    expect(listCalls[1]).toContain("sha=abc");
  });

  it("falls back to the GitHub target URL and rejects unsafe schemes", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/deployments?")) return json([{ id: 2 }, { id: 1 }]);
      if (url.includes("/deployments/2/statuses")) {
        return json([{ state: "success", environment_url: "javascript:alert(1)" }]);
      }
      return json([{ state: "success", target_url: "https://deploy.example.com/output" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "success", url: "https://deploy.example.com/output", startedAt: null, durationMs: null });
  });

  it("matches the GitLab deployment to the pull request head", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json([
        {
          sha: "other",
          environment: { external_url: "https://other.example.com" },
        },
        {
          sha: "abc",
          environment: { external_url: "https://preview.example.com/mr-42" },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGitlabDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "success", url: "https://preview.example.com/mr-42", startedAt: null, durationMs: null });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/projects/acme%2Fapp/deployments?order_by=updated_at&sort=desc&per_page=100",
    );
  });

  it("prefers the GitLab branch deployment over the matching head deployment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json([
          {
            ref: "commit-preview",
            sha: "abc",
            environment: { external_url: "https://commit.example.com" },
          },
          {
            ref: "feature/preview",
            sha: "older",
            environment: { external_url: "https://branch.example.com" },
          },
        ]),
      ),
    );

    await expect(
      getGitlabDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "success", url: "https://branch.example.com/", startedAt: null, durationMs: null });
  });

  it("returns no GitLab action without a safe matching environment URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json([{ sha: "abc", environment: { external_url: "data:text/html,unsafe" } }]),
      ),
    );

    await expect(
      getGitlabDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        sha: "abc",
      }),
    ).resolves.toEqual({ status: "none", url: null, startedAt: null, durationMs: null });
  });

  it("reads a building Vercel commit status when no GitHub deployment exists yet", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) return json([]);
      if (url.includes("sha=prev")) {
        return json([{ id: 77, created_at: "2026-09-03T09:50:00Z" }]);
      }
      if (url.includes("sha=old")) {
        return json([{ id: 79, created_at: "2026-09-03T09:40:00Z" }]);
      }
      if (url.includes("/deployments?")) return json([]);
      if (url.includes("/pulls/42/commits")) {
        return json([{ sha: "old" }, { sha: "prev" }, { sha: "head" }]);
      }
      if (url.includes("/deployments/77/statuses")) {
        return json([
          { state: "success", environment_url: "https://serving.example.com" },
        ]);
      }
      if (url.includes("/deployments/78/statuses")) {
        return json([{ state: "success", environment_url: null }]);
      }
      if (url.includes("/deployments/79/statuses")) {
        return json([{ state: "success", environment_url: "https://older.example.com" }]);
      }
      if (url.includes("/status/head")) {
        return json({
          state: "pending",
          statuses: [
            { context: "ci/unit", state: "pending" },
            {
              context: "Vercel",
              state: "pending",
              target_url: "https://vercel.com/acme/app/build",
              created_at: "2026-09-03T10:00:00Z",
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "head",
      }),
    ).resolves.toEqual({
      status: "in_progress",
      url: "https://serving.example.com/",
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    });
  });

  it("dates the settle from the push, not from a late deployment stamp", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) return json([]);
      // A provider that stamps the deployment object when the environment
      // is ALREADY served: created_at ~ the settle, useless as a start.
      if (url.includes("/deployments?ref=")) {
        return json([{ id: 9, created_at: "2026-09-03T10:04:59Z" }]);
      }
      if (url.includes("/deployments/9/statuses")) {
        return json([
          {
            state: "success",
            environment_url: "https://ready.example.com",
            created_at: "2026-09-03T10:05:00Z",
          },
        ]);
      }
      if (url.includes("/commits/head")) {
        return json({
          commit: { committer: { date: "2026-09-03T10:00:00Z" } },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "head",
      }),
    ).resolves.toEqual({
      status: "success",
      url: "https://ready.example.com/",
      startedAt: null,
      durationMs: 300_000,
    });
  });

  it("ticks the running card from the push while the build runs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/issues/42/comments")) return json([]);
      if (url.includes("/deployments?ref=")) {
        return json([{ id: 9, created_at: "2026-09-03T10:04:59Z" }]);
      }
      if (url.includes("/deployments/9/statuses")) {
        return json([{ state: "in_progress" }]);
      }
      if (url.includes("/commits/head")) {
        return json({
          commit: { committer: { date: "2026-09-03T10:00:00Z" } },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getGithubDeploymentUrl({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
        branch: "feature/preview",
        sha: "head",
      }),
    ).resolves.toEqual({
      status: "in_progress",
      url: null,
      startedAt: "2026-09-03T10:00:00Z",
      durationMs: null,
    });
  });
});
