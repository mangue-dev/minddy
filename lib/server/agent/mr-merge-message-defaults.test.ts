import { afterEach, describe, expect, it, vi } from "vitest";

import { getMergeRequest } from "./mr";

afterEach(() => {
  vi.unstubAllGlobals();
});

function restMergeRequest() {
  return {
    iid: 42,
    web_url: "https://gitlab.com/acme/app/-/merge_requests/42",
    state: "opened",
    title: "Improve merge readiness",
    source_branch: "feature/readiness",
    target_branch: "main",
    detailed_merge_status: "mergeable",
  };
}

describe("GitLab merge message defaults", () => {
  it("reads fully rendered defaults from GitLab GraphQL", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/graphql")) {
          return new Response(
            JSON.stringify({
              data: {
                project: {
                  mergeRequest: {
                    defaultMergeCommitMessage:
                      "Merge readiness\n\nApproved-by: Ada",
                    defaultSquashCommitMessage:
                      "Improve merge readiness\n\nReviewed-by: Lin",
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(restMergeRequest()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMergeRequest({
      token: "token",
      repoFullName: "acme/app",
      number: 42,
    });

    expect(result).toMatchObject({
      defaultMergeCommitMessage: "Merge readiness\n\nApproved-by: Ada",
      defaultSquashCommitMessage:
        "Improve merge readiness\n\nReviewed-by: Lin",
    });
    const graphqlCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/api/graphql"),
    );
    expect(graphqlCall).toBeDefined();
    const body = JSON.parse(String(graphqlCall?.[1]?.body));
    expect(body.variables).toEqual({ projectPath: "acme/app", iid: "42" });
  });

  it("leaves defaults absent when GraphQL is unavailable", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/graphql")) {
        return new Response(
          JSON.stringify({ errors: [{ message: "Field is unavailable" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(restMergeRequest()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getMergeRequest({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
      }),
    ).resolves.toMatchObject({
      number: 42,
      defaultMergeCommitMessage: null,
      defaultSquashCommitMessage: null,
    });
  });
});
