import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-327: the forge token is scoped to the project's repository.
 *
 * `POST /app/installations/{id}/access_tokens` without a body returns the
 * maximal token of the installation: every repository, every permission. A
 * project that links one repository must never hold a token that opens the
 * account's other private repositories.
 *
 * Both halves of the contract are tested: what `getInstallationToken` sends
 * (scope and permissions), and what `resolveRepoCloneTarget` asks for. Only
 * `fetch` is faked, the one thing that leaves the process here.
 */

const h = vi.hoisted(() => ({
  /** The mint bodies actually sent to GitHub, in order. */
  minted: [] as Array<Record<string, unknown> | null>,
  link: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.link }) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: vi.fn(async () => null),
}));

import {
  __clearInstallationTokenCacheForTests,
  getInstallationToken,
} from "./github-app";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  h.minted.length = 0;
  h.link = {
    id: "link-1",
    provider: "github",
    connection_id: "conn-1",
    installation_id: 4242,
    external_repo_id: "1288848861",
    repo_full_name: "mangue-dev/minddy",
    default_branch: "main",
  };
  __clearInstallationTokenCacheForTests();
  process.env.GITHUB_APP_ID = "1";
  process.env.GITHUB_APP_SLUG = "minddy-test";
  process.env.GIT_STATE_SECRET = "x".repeat(32);
  // Disposable test key: `mintAppJwt` signs for real, it needs a PEM.
  process.env.GITHUB_APP_PRIVATE_KEY = TEST_PRIVATE_KEY;

  let n = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/access_tokens")) {
      h.minted.push(init?.body ? JSON.parse(String(init.body)) : null);
      n += 1;
      return new Response(
        JSON.stringify({
          token: `ghs_token_${n}`,
          // Well beyond the security window: the cache must be able to play.
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("installation token mint", () => {
  it("sends no body without a scope", async () => {
    // Enumerating an installation's repositories cannot be scoped to one.
    await getInstallationToken(4242);
    expect(h.minted).toEqual([null]);
  });

  it("forwards `repositories` and `permissions` as given", async () => {
    await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(h.minted).toEqual([
      { repositories: ["minddy"], permissions: { contents: "read" } },
    ]);
  });

  it("never serves a wide cached token to a narrower request", async () => {
    // A cache keyed on `installationId` alone would hand the maximal token of
    // the first call to a caller that asked for a restricted one.
    const wide = await getInstallationToken(4242);
    const narrow = await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(wide.token).not.toBe(narrow.token);
    expect(h.minted).toHaveLength(2);
  });

  it("reuses the same token for an EQUAL scope regardless of key order", async () => {
    const a = await getInstallationToken(4242, {
      repositories: ["b", "a"],
      permissions: { contents: "write", issues: "read" },
    });
    const b = await getInstallationToken(4242, {
      repositories: ["a", "b"],
      permissions: { issues: "read", contents: "write" },
    });
    expect(b.token).toBe(a.token);
    expect(h.minted).toHaveLength(1);
  });
});

describe("project forge target", () => {
  it("always scopes the token to the linked stable repository id", async () => {
    await resolveRepoCloneTarget("proj-1");
    expect(h.minted[0]).toMatchObject({ repository_ids: [1288848861] });
  });

  it("keeps the installation's own permissions", async () => {
    // Narrowing them would protect nothing more (the repository is already
    // the only one) and would break installations that did not accept a
    // recent permission.
    await resolveRepoCloneTarget("proj-1");
    expect(h.minted[0]).not.toHaveProperty("permissions");
  });
});

/** Disposable PEM, generated when loading the file: `mintAppJwt` sign for real,
 * it needs a real key - and a hard key in a repository, even a test one,
 * looks too much like a real one to put one here. */
const TEST_PRIVATE_KEY = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
