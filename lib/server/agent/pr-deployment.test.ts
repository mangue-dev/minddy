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
  it("returns the newest successful GitHub environment URL", async () => {
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
        sha: "abc 123",
      }),
    ).resolves.toBe("https://preview.example.com/pr-42");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sha=abc%20123");
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
