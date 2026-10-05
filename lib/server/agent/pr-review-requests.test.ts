import { afterEach, describe, expect, it, vi } from "vitest";

import { getPullRequest, requestPullRequestReviewer as requestGithubReviewer } from "./pr";

import { requestPullRequestReviewer as requestGitlabReviewer, getMergeRequest } from "./mr";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPullRequest review requests", () => {
  it("normalizes pending GitHub reviewers into the pull request response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        Response.json({
          number: 110,
          html_url: "https://github.com/mangue-dev/minddy/pull/110",
          state: "open",
          requested_reviewers: [
            { login: "mangue-dev", avatar_url: "https://avatars.example/user.png" },
            { avatar_url: "https://avatars.example/missing-login.png" },
          ],
        }),
      ),
    );

    await expect(
      getPullRequest({
        token: "token",
        repoFullName: "mangue-dev/minddy",
        number: 110,
      }),
    ).resolves.toMatchObject({
      requestedReviewers: [
        { login: "mangue-dev", avatar_url: "https://avatars.example/user.png" },
      ],
    });
  });

  it.each([
    ["mangue-dev/minddy", true],
    ["outside-contributor/minddy", false],
  ])("identifies whether the head repository %s is the base repository", async (fullName, same) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        Response.json({
          number: 119,
          html_url: "https://github.com/mangue-dev/minddy/pull/119",
          state: "open",
          head: { ref: "main", repo: { full_name: fullName } },
        }),
      ),
    );

    await expect(
      getPullRequest({
        token: "token",
        repoFullName: "mangue-dev/minddy",
        number: 119,
      }),
    ).resolves.toMatchObject({ headFromBaseRepository: same });
  });
});


describe("requesting a reviewer", () => {
  it("uses the supplied human token and GitHub's additive reviewer request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await requestGithubReviewer({
      token: "human-token",
      repoFullName: "acme/app",
      number: 42,
      login: "ada",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/pulls/42/requested_reviewers");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer human-token",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ reviewers: ["ada"] });
  });

  it("preserves existing GitLab reviewers and deduplicates requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ id: 12, username: "Ada" }]))
      .mockResolvedValueOnce(
        Response.json({ reviewers: [{ id: 7 }, { id: 12 }] }),
      )
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await requestGitlabReviewer({
      token: "human-token",
      repoFullName: "group/app",
      number: 42,
      login: "ada",
    });
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toContain("group%2Fapp/merge_requests/42");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({ reviewer_ids: [7, 12] });
  });

  it("does not clear GitLab reviewers when the requested login cannot be found", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      requestGitlabReviewer({
        token: "token",
        repoFullName: "group/app",
        number: 42,
        login: "missing",
      }),
    ).rejects.toThrow("Reviewer not found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("only exposes unreviewed GitLab requests as pending in the PR detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes("graphql"))
          return Response.json({ data: { project: { mergeRequest: null } } });
        if (String(url).endsWith("/reviewers"))
          return Response.json([
            { state: "unreviewed", user: { username: "ada" } },
            { state: "reviewed", user: { username: "grace" } },
          ]);
        return Response.json({
          iid: 42,
          state: "opened",
          reviewers: [{ id: 12, username: "ada", avatar_url: null }],
        });
      }),
    );
    await expect(
      getMergeRequest({
        token: "token",
        repoFullName: "group/app",
        number: 42,
      }),
    ).resolves.toMatchObject({
      requestedReviewers: [{ login: "ada", avatar_url: null }],
    });
  });
});
