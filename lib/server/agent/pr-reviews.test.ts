import { afterEach, describe, expect, it, vi } from "vitest";

import { listPullRequestReviews } from "./pr";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listPullRequestReviews", () => {
  it("uses every review page when calculating the latest verdict per reviewer", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      state: index === 0 ? "CHANGES_REQUESTED" : "COMMENTED",
      user: { login: index === 0 ? "ada" : `reviewer-${index}` },
    }));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(
        Response.json([
          { state: "APPROVED", user: { login: "ada" } },
          { state: "APPROVED", user: { login: "grace" } },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listPullRequestReviews({
        token: "token",
        repoFullName: "acme/app",
        number: 42,
      }),
    ).resolves.toEqual({ approvals: 2, changesRequested: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("per_page=100&page=1");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("per_page=100&page=2");
  });
});
