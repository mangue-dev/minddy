import { afterEach, describe, expect, it, vi } from "vitest";

import { FORGE_METHOD_ACCESS, FORGE_READ_METHODS, forgeFor, isForgeApiError } from "./forge";
import { GitlabApiError } from "./mr";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("forge method access table", () => {
  it.each(["github", "gitlab"] as const)("classifies every %s method as a read or a write", (provider) => {
    const forge = forgeFor(provider);
    const methods = Object.keys(forge).filter(
      (name) => typeof forge[name as keyof typeof forge] === "function",
    );
    expect(methods.sort()).toEqual(Object.keys(FORGE_METHOD_ACCESS).sort());
  });

  it("never shares a write between display requests", () => {
    expect(FORGE_READ_METHODS).toContain("getPullRequest");
    for (const name of ["mergePullRequest", "submitReview", "setReviewThreadResolved"] as const) {
      expect(FORGE_READ_METHODS).not.toContain(name);
    }
  });
});

describe("GitLab API errors", () => {
  it("carry the forge's Retry-After, like GitHub ones", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: "Too Many Requests" }), {
      status: 429,
      headers: { "Retry-After": "30" },
    })) as unknown as typeof fetch;
    const error = await forgeFor("gitlab")
      .getPullRequest({ token: "t", repoFullName: "group/app", number: 3 })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GitlabApiError);
    expect(isForgeApiError(error)).toBe(true);
    expect(error).toMatchObject({ status: 429, retryAfter: "30" });
  });
});
