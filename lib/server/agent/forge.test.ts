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

describe("forge identity", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names minddy's GitHub App bot and no GitLab bot (MIN-146)", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "minddy-app");
    expect(forgeFor("github").identity.botLogin()).toBe("minddy-app[bot]");
    expect(forgeFor("gitlab").identity.botLogin()).toBeNull();
  });

  it("has no bot login when the GitHub App is not configured", () => {
    vi.stubEnv("GITHUB_APP_SLUG", "");
    expect(forgeFor("github").identity.botLogin()).toBeNull();
  });

  it("finds a member's own account where each forge stores it", () => {
    expect(forgeFor("github").identity.accountTable).toBe("git_user_identities");
    expect(forgeFor("gitlab").identity.accountTable).toBe("git_connections");
  });
});

describe("repository file discovery", () => {
  const opts = { token: "t", ref: "main", roots: [".claude/skills"], fileName: "SKILL.md" };

  it("walks GitHub directories and stops at one that holds the file", async () => {
    const listings: Record<string, unknown[]> = {
      ".claude/skills": [
        { path: ".claude/skills/review", type: "dir", name: "review" },
        { path: ".claude/skills/README.md", type: "file", name: "README.md" },
      ],
      ".claude/skills/review": [
        { path: ".claude/skills/review/SKILL.md", type: "file", name: "SKILL.md" },
        { path: ".claude/skills/review/nested", type: "dir", name: "nested" },
      ],
    };
    const fetchMock = vi.fn(async (url: string) => {
      const directory = decodeURIComponent(new URL(url).pathname.split("/contents/")[1]);
      const listing = listings[directory];
      return listing
        ? new Response(JSON.stringify(listing), { status: 200 })
        : new Response("{}", { status: 404 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const paths = await forgeFor("github").findFilesNamed({ ...opts, repoFullName: "acme/app" });
    expect(paths).toEqual([".claude/skills/review/SKILL.md"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads GitLab's recursive tree page by page", async () => {
    const pages: Record<string, { entries: unknown[]; next?: string }> = {
      "1": { entries: [{ path: ".claude/skills/a/SKILL.md", type: "blob", name: "SKILL.md" }], next: "2" },
      "2": { entries: [
        { path: ".claude/skills/b", type: "tree", name: "b" },
        { path: ".claude/skills/b/SKILL.md", type: "blob", name: "SKILL.md" },
      ] },
    };
    globalThis.fetch = vi.fn(async (url: string) => {
      const page = pages[new URL(url).searchParams.get("page") ?? "1"];
      return new Response(JSON.stringify(page.entries), {
        status: 200,
        headers: page.next ? { "x-next-page": page.next } : {},
      });
    }) as unknown as typeof fetch;
    const paths = await forgeFor("gitlab").findFilesNamed({ ...opts, repoFullName: "group/app" });
    expect(paths).toEqual([".claude/skills/a/SKILL.md", ".claude/skills/b/SKILL.md"]);
  });

  it("fails on a forge error other than a missing directory", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(forgeFor("github").findFilesNamed({ ...opts, repoFullName: "acme/app" }))
      .rejects.toThrow("GitHub file discovery failed (500)");
  });
});
