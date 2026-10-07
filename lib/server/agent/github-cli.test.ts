import { describe, expect, it, vi } from "vitest";
import { githubCliRequestUrl, relayGithubCliRequest, GITHUB_CLI_MAX_BYTES } from "./github-cli";
import type { RepoCloneTarget } from "./repo-access";

const target = { provider: "github", repoFullName: "acme/app", token: "private-token" } as RepoCloneTarget;

describe("repository-scoped GitHub CLI relay", () => {
  it.each(["//evil.test/repos/acme/app", "/repos/acme/app-other/pulls", "/repos/other/app/pulls", "/repos/acme/app/../../other/app", "/repos/acme/app/%2e%2e/pulls", "/repos/acme/app/%2f../pulls", "/repos/acme/app\\../other", "/user", "/graphql#fragment"])("rejects %s", (path) => {
    expect(githubCliRequestUrl("acme/app", path, "POST")).toBeNull();
  });

  it("injects the trusted token only on a fixed API origin and preserves upstream errors", async () => {
    const fetcher = vi.fn(async () => new Response('{"message":"Validation Failed"}', {
      status: 422, headers: { "content-type": "application/json", "set-cookie": "private-cookie" },
    }));
    const result = await relayGithubCliRequest(target, { path: "/repos/acme/app/pulls", method: "POST", body: '{"title":"Update"}' }, fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/acme/app/pulls", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer private-token" }), redirect: "error",
    }));
    expect(result).toEqual({ status: 422, headers: { "content-type": "application/json" }, body: '{"message":"Validation Failed"}' });
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("supports GraphQL using the same repository-scoped credential", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request) => new Response("{}"));
    await relayGithubCliRequest(target, { path: "/graphql", method: "POST", body: JSON.stringify({ query: 'query{repository(owner:"acme",name:"app"){id}}' }) }, fetcher);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.github.com/graphql");
    expect(githubCliRequestUrl("acme/app", "/graphql", "GET")).toBeNull();
  });

  it("bounds request and response bodies", async () => {
    const fetcher = vi.fn(async () => new Response("x".repeat(GITHUB_CLI_MAX_BYTES + 1)));
    await expect(relayGithubCliRequest(target, { path: "/repos/acme/app", method: "POST", body: "x".repeat(GITHUB_CLI_MAX_BYTES + 1) }, fetcher)).rejects.toThrow("request exceeds");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(relayGithubCliRequest(target, { path: "/repos/acme/app", method: "GET" }, fetcher)).rejects.toThrow("response exceeds");
  });
});
