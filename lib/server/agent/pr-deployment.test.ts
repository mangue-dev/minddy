import { afterEach, describe, expect, it, vi } from "vitest";

import { getLatestSuccessfulDeploymentUrl as getGithubDeploymentUrl } from "./pr";
import { getLatestSuccessfulDeploymentUrl as getGitlabDeploymentUrl } from "./mr";

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
  it("returns the newest successful GitHub branch environment URL", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
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
        branch: "feature/preview",
        sha: "abc 123",
      }),
    ).resolves.toBe("https://preview.example.com/pr-42");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("ref=feature%2Fpreview");
  });

  it("falls back to the GitHub head when the branch has no usable deployment", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
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
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toBe("https://commit.example.com/");

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
      getGithubDeploymentUrl({ token: "token", repoFullName: "acme/app", sha: "abc" }),
    ).resolves.toBe("https://deploy.example.com/output");
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
      getGitlabDeploymentUrl({ token: "token", repoFullName: "acme/app", sha: "abc" }),
    ).resolves.toBe("https://preview.example.com/mr-42");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/projects/acme%2Fapp/deployments?order_by=updated_at&sort=desc&status=success",
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
        branch: "feature/preview",
        sha: "abc",
      }),
    ).resolves.toBe("https://branch.example.com/");
  });

  it("returns no GitLab action without a safe matching environment URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json([{ sha: "abc", environment: { external_url: "data:text/html,unsafe" } }]),
      ),
    );

    await expect(
      getGitlabDeploymentUrl({ token: "token", repoFullName: "acme/app", sha: "abc" }),
    ).resolves.toBeNull();
  });
});
