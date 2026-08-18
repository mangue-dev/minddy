import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-327 — THE FORGE TOKEN IS SCOPED FROM THE PROJECT REPOSITORY.
 *
 * `POST /app/installations/{id}/access_tokens` without a body returns the MAXIMAL
 * token of the installation: all its repositories, all its permissions. It was this token
 * which went into the `.git/config` of the agent's microVM — readable by the
 * model, exfiltrable by an injection, and it then opened all the private repositories
 * of the account for a project which only linked one.
 *
 * We therefore test the two halves of the contract: what `getInstallationToken`
 * SENDS (scope + permissions), and what `resolveRepoCloneTarget` ASKS it
 * depending on who will hold the token. The `fetch` is wrong — it's the only thing that
 * comes out of the process here.
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

describe("le mint d'un token d'installation", () => {
  it("n'envoie aucun corps quand on ne lui donne pas de portée", async () => {
    // The historical form remains possible — it is that of the calls which enumerate
    // installation repositories, and which CANNOT be scoped to a repository.
    await getInstallationToken(4242);
    expect(h.minted).toEqual([null]);
  });

  it("transmet `repositories` et `permissions` tels qu'on les lui donne", async () => {
    await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(h.minted).toEqual([
      { repositories: ["minddy"], permissions: { contents: "read" } },
    ]);
  });

  it("ne resserre PAS un token large en le resservant depuis le cache", async () => {
    // The trap we keep here: a cache key on the only `installationId`
    // would return the maximum token of the first call to a caller who requested a
    // restricted token. The restriction would be true on the wire, false in memory.
    const large = await getInstallationToken(4242);
    const etroit = await getInstallationToken(4242, {
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
    expect(large.token).not.toBe(etroit.token);
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

describe("la cible de clone d'un projet", () => {
  it("ALWAYS scopes the token to the linked repository by its short name", async () => {
    await resolveRepoCloneTarget("proj-1");
    // `mangue-dev/minddy` and not `minddy` would be worth 422 at GitHub: that's the name
    // court que `repositories` attend.
    expect(h.minted[0]).toMatchObject({ repositories: ["minddy"] });
  });

  it("does not narrow the permissions of the token that remains in the function", async () => {
    // `full`: he is the one who opens the PRs, comments, rereads, merges. Take away from him
    // permissions would limit nothing more (the repository is already the only one) and
    // would break installations that did not accept a recent permission.
    await resolveRepoCloneTarget("proj-1", "full");
    expect(h.minted[0]).not.toHaveProperty("permissions");
  });

  it("donne `contents: write` à la microVM d'un run qui pousse", async () => {
    await resolveRepoCloneTarget("proj-1", "repo-write");
    expect(h.minted[0]).toMatchObject({
      repositories: ["minddy"],
      permissions: { contents: "write" },
    });
  });

  it("donne `contents: read` à la microVM d'une relecture", async () => {
    // The heart of the ticket: a proofread is the only anchor from which the content comes
    // from an unknown fork, and it doesn't write anything to the repository.
    await resolveRepoCloneTarget("proj-1", "repo-read");
    expect(h.minted[0]).toMatchObject({
      repositories: ["minddy"],
      permissions: { contents: "read" },
    });
  });

  it("returns DIFFERENT tokens for the three profiles", async () => {
    const full = await resolveRepoCloneTarget("proj-1", "full");
    const write = await resolveRepoCloneTarget("proj-1", "repo-write");
    const read = await resolveRepoCloneTarget("proj-1", "repo-read");
    expect(new Set([full!.token, write!.token, read!.token]).size).toBe(3);
  });
});

/** Disposable PEM, generated when loading the file: `mintAppJwt` sign for real,
 * it needs a real key - and a hard key in a repository, even a test one,
 * looks too much like a real one to put one here. */
const TEST_PRIVATE_KEY = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
