import { afterEach, describe, expect, it, vi } from "vitest";

import { getPullRequest } from "./pr";

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
