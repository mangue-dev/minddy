import { afterEach, describe, expect, it, vi } from "vitest";

import { convertMergeRequestToDraft } from "./mr";
import { convertPullRequestToDraft } from "./pr";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pull request draft transitions", () => {
  it("uses the GitHub GraphQL draft mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            convertPullRequestToDraft: {
              pullRequest: { number: 42, isDraft: true },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await convertPullRequestToDraft({ token: "token", nodeId: "PR_node" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      query:
        "mutation($id:ID!){convertPullRequestToDraft(input:{pullRequestId:$id})" +
        "{pullRequest{number isDraft}}}",
      variables: { id: "PR_node" },
    });
  });

  it("adds one normalized GitLab draft prefix", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ title: "WIP: Improve review controls" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await convertMergeRequestToDraft({
      token: "token",
      repoFullName: "mangue-dev/minddy",
      number: 42,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Draft: Improve review controls",
    });
  });

  it("preserves a regular GitLab title beginning with Draft", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Drafting the API" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), {
        status: 200, headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await convertMergeRequestToDraft({
      token: "token", repoFullName: "mangue-dev/minddy", number: 42,
    });
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ title: "Draft: Drafting the API" });
  });
});
