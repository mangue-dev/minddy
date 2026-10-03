import { afterEach, describe, expect, it, vi } from "vitest";
import { githubResponseText, withGithubReadScope } from "./github-read-flight";
import { getPullRequest, listPullRequestReviewThreads } from "./pr";

afterEach(() => vi.unstubAllGlobals());
const identity = ["user-1", "github", "link-1", "connection-1", "repo-1", "acme/app"];
const url = "https://api.github.com/repos/acme/app/pulls/1";
const options = { headers: { Accept: "application/json" } };

function heldFetch() {
  const releases: Array<(response: Response) => void> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => releases.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  return { fetch, releases };
}

describe("authorized GitHub reads in flight", () => {
  it("shares identical reads only until settlement and gives consumers independent objects", async () => {
    const { fetch, releases } = heldFetch();
    const call = { token: "token-1", repoFullName: "acme/app", number: 1 };
    const first = withGithubReadScope(identity, () => getPullRequest(call));
    const second = withGithubReadScope(identity, () => getPullRequest(call));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ cache: "no-store" }));
    releases[0](Response.json({ number: 1, state: "open", title: "Current" }));
    const [a, b] = await Promise.all([first, second]);
    a.title = "Changed locally";
    expect(b.title).toBe("Current");
    const third = withGithubReadScope(identity, () => getPullRequest(call));
    expect(fetch).toHaveBeenCalledTimes(2);
    releases[1](Response.json({ number: 1, state: "closed" }));
    expect((await third).state).toBe("closed");
  });

  it.each([0, 1, 2, 3, 4, 5])("isolates authority identity segment %s", async (index) => {
    const { fetch, releases } = heldFetch();
    const other = identity.map((part, i) => i === index ? `${part}-other` : part);
    const a = withGithubReadScope(identity, () => githubResponseText(url, "token", options, true));
    const b = withGithubReadScope(other, () => githubResponseText(url, "token", options, true));
    expect(fetch).toHaveBeenCalledTimes(2);
    releases.forEach((release) => release(Response.json({})));
    await Promise.all([a, b]);
  });

  it("isolates rotated tokens, heads, versions, pages and GraphQL variables", async () => {
    const { fetch, releases } = heldFetch();
    const inputs: Array<[string, string, RequestInit]> = [
      [url, "old", options], [url, "new", options],
      [url + "?page=2", "old", options], [url + "?head=new", "old", options],
      [url, "old", { headers: { Accept: "application/json", "X-GitHub-Api-Version": "other" } }],
      ["https://api.github.com/graphql", "old", { method: "POST", body: '{"query":"query {node}","variables":{"id":"a"}}' }],
      ["https://api.github.com/graphql", "old", { method: "POST", body: '{"query":"query {node}","variables":{"id":"b"}}' }],
    ];
    const pending = inputs.map(([url, token, init]) => withGithubReadScope(identity, () => githubResponseText(url, token, init, true)));
    expect(fetch).toHaveBeenCalledTimes(inputs.length);
    releases.forEach((release) => release(Response.json({})));
    await Promise.all(pending);
  });

  it("does not share unscoped authoritative reads used by sensitive decisions", async () => {
    const { fetch, releases } = heldFetch();
    const a = withGithubReadScope(identity, () => githubResponseText(url, "token", options, true));
    const b = githubResponseText(url, "token", options, true);
    const c = githubResponseText(url, "token", options, true);
    expect(fetch).toHaveBeenCalledTimes(3);
    releases.forEach((release) => release(Response.json({})));
    await Promise.all([a, b, c]);
  });

  it("fences pending display reads before, during and after a mutation", async () => {
    const { fetch, releases } = heldFetch();
    const read = () => withGithubReadScope(identity, () => githubResponseText(url, "token", options, true));
    const before = read();
    const write = githubResponseText(url, "token", { method: "PATCH" }, false);
    const during = read();
    expect(fetch).toHaveBeenCalledTimes(3);
    releases[1](Response.json({})); await write;
    const after = read(); expect(fetch).toHaveBeenCalledTimes(4);
    releases[0](Response.json({ version: "before" }));
    releases[2](Response.json({ version: "during" }));
    releases[3](Response.json({ version: "after" }));
    expect(JSON.parse((await after).text)).toEqual({ version: "after" });
    await Promise.all([before, during]);
  });

  it.each([403, 429, 500])("retires a shared %s response without automatic retries", async (status) => {
    const { fetch, releases } = heldFetch();
    const read = () => withGithubReadScope(identity, () => githubResponseText(url, "token", options, true));
    const a = read(), b = read();
    releases[0](Response.json({ message: "Unavailable" }, { status, headers: { "Retry-After": "60" } }));
    expect((await a).status).toBe(status); await b;
    expect(fetch).toHaveBeenCalledOnce();
    const retry = read(); expect(fetch).toHaveBeenCalledTimes(2);
    releases[1](Response.json({})); await retry;
  });

  it("shares GraphQL query transport and preserves its error semantics", async () => {
    const { fetch, releases } = heldFetch();
    const call = { token: "token", repoFullName: "acme/app", number: 1 };
    const a = withGithubReadScope(identity, () => listPullRequestReviewThreads(call));
    const b = withGithubReadScope(identity, () => listPullRequestReviewThreads(call));
    const assertions = [expect(a).rejects.toMatchObject({ status: 422 }), expect(b).rejects.toMatchObject({ status: 422 })];
    expect(fetch).toHaveBeenCalledOnce();
    releases[0](Response.json({ errors: [{ message: "Query unavailable" }] }));
    await Promise.all(assertions);
  });
});
