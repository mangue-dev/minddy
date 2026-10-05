import { beforeEach, describe, expect, it, vi } from "vitest";
import { prRequestReviewerResponse, type PrScope } from "./pr-actions";
import { broadcastPrChanged } from "./pr-live";

vi.mock("./pr-live", () => ({ broadcastPrChanged: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
beforeEach(() => vi.clearAllMocks());

function fixture(state = "open", capability = "write") {
  const request = vi.fn(async () => {});
  const actor = vi.fn(async () => ({
    kind: "actor",
    token: "human-token",
    login: "maintainer",
    capability,
  }));
  const scope = {
    pr: { id: "request-review-pr", number: 42 },
    target: { provider: "github", repoFullName: "acme/app" },
    call: { token: "installation-token", repoFullName: "acme/app", number: 42 },
    actor,
    forge: {
      getPullRequest: async () => ({ state, user: { login: "Author" } }),
      requestPullRequestReviewer: request,
    },
  } as unknown as PrScope;
  return { scope, request, actor };
}

describe("prRequestReviewerResponse", () => {
  it("requests with the human token and broadcasts only after success", async () => {
    const { scope, request } = fixture();
    expect((await prRequestReviewerResponse(scope, "ada")).status).toBe(200);
    expect(request).toHaveBeenCalledWith({
      token: "human-token",
      repoFullName: "acme/app",
      number: 42,
      login: "ada",
    });
    expect(broadcastPrChanged).toHaveBeenCalledWith("request-review-pr", [
      "pr",
      "conversation",
    ]);
  });

  it.each([null, "", " ", "bad/name", "bad name"])(
    "rejects invalid login %s before resolving identity",
    async (login) => {
      const { scope, request, actor } = fixture();
      expect((await prRequestReviewerResponse(scope, login)).status).toBe(400);
      expect(actor).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("requires write access and never falls back to the installation token", async () => {
    const { scope, request } = fixture("open", "read");
    expect((await prRequestReviewerResponse(scope, "ada")).status).toBe(403);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["closed", "ada", 409],
    ["open", "author", 422],
  ])("rejects state %s and reviewer %s", async (state, login, expected) => {
    const { scope, request } = fixture(state as string);
    expect((await prRequestReviewerResponse(scope, login)).status).toBe(
      expected,
    );
    expect(request).not.toHaveBeenCalled();
    expect(broadcastPrChanged).not.toHaveBeenCalled();
  });

  it("does not broadcast when the forge rejects a request", async () => {
    const { scope, request } = fixture();
    request.mockRejectedValue(new Error("Unavailable"));
    expect((await prRequestReviewerResponse(scope, "ada")).status).toBe(500);
    expect(broadcastPrChanged).not.toHaveBeenCalled();
  });

  it("serializes requests to preserve GitLab's existing reviewer list", async () => {
    const { scope, request } = fixture();
    let release!: () => void;
    request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = prRequestReviewerResponse(scope, "ada");
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect((await prRequestReviewerResponse(scope, "grace")).status).toBe(409);
    release();
    expect((await pending).status).toBe(200);
  });
});
