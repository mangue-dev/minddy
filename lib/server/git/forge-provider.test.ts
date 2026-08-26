import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The ForgeProvider seam (docs/managed-forge-relay-plan.md, Phase 1).
 *
 * Two properties are pinned here:
 *
 * 1. **Local behavior is unchanged.** `LocalForgeProvider` is pure delegation:
 *    the GitHub scoping rules (short repo names, per-profile permissions) and
 *    the GitLab lazy refresh keep living in github-app.ts / gitlab-app.ts, and
 *    repo-access keeps asking for the same tokens with the same arguments.
 * 2. **Selection fails closed.** A connection marked `source: "relay"` never
 *    falls back to the local provider — until the Phase 3 relay client ships,
 *    it is an explicit error, not a silent local mint.
 */

let installationTokenCalls: {
  installationId: number | string;
  scope?: {
    repositories?: string[];
    repositoryIds?: number[];
    permissions?: Record<string, string>;
  };
}[] = [];
let gitlabTokenCalls: string[] = [];

vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationToken: async (
    installationId: number | string,
    scope?: {
      repositories?: string[];
      repositoryIds?: number[];
      permissions?: Record<string, string>;
    },
  ) => {
    installationTokenCalls.push({ installationId, scope });
    return { token: "installation-token", expiresAt: "2026-08-21T12:00:00Z" };
  },
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async (connectionId: string) => {
    gitlabTokenCalls.push(connectionId);
    return "gitlab-connection-token";
  },
}));

const relayRequestCalls: { path: string; body: Record<string, unknown> }[] = [];
let relayResponse: { ok: boolean; error: string | null; data: unknown } = {
  ok: true,
  error: null,
  data: { token: "relayed-token", expiresAt: "2026-08-21T12:00:00Z" },
};
let relayGate: Promise<void> | null = null;

vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => true,
  relayRequest: async (path: string, body: Record<string, unknown>) => {
    relayRequestCalls.push({ path, body });
    if (relayGate) await relayGate;
    return relayResponse;
  },
}));

interface Row extends Record<string, unknown> {}

let linkRow: Row | null = null;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = async () => ({ data: linkRow, error: null });
      return query;
    },
  }),
}));

const {
  __clearRelayTokenCacheForTests,
  __relayTokenCacheSizeForTests,
  localForgeProvider,
  relayForgeProvider,
  forgeProviderForConnection,
} = await import(
  "@/lib/server/git/forge-provider"
);
const { resolveRepoCloneTarget } = await import("@/lib/server/agent/repo-access");

beforeEach(() => {
  __clearRelayTokenCacheForTests();
  installationTokenCalls = [];
  gitlabTokenCalls = [];
  relayRequestCalls.length = 0;
  relayResponse = {
    ok: true,
    error: null,
    data: { token: "relayed-token", expiresAt: "2026-08-21T12:00:00Z" },
  };
  relayGate = null;
  linkRow = null;
});

describe("LocalForgeProvider", () => {
  it("delegates GitHub token minting to the local GitHub App client", async () => {
    const result = await localForgeProvider.getInstallationToken({
      installationId: 42,
      scope: { repositories: ["app"], permissions: { contents: "write" } },
    });
    expect(result).toEqual({
      token: "installation-token",
      expiresAt: "2026-08-21T12:00:00Z",
    });
    expect(installationTokenCalls).toEqual([
      {
        installationId: 42,
        scope: { repositories: ["app"], permissions: { contents: "write" } },
      },
    ]);
  });

  it("delegates GitLab tokens to the local OAuth client", async () => {
    await expect(
      localForgeProvider.getGitlabAccessToken("conn-1"),
    ).resolves.toBe("gitlab-connection-token");
    expect(gitlabTokenCalls).toEqual(["conn-1"]);
  });
});

describe("forgeProviderForConnection", () => {
  it("resolves local connections and unmarked rows to the local provider", () => {
    expect(forgeProviderForConnection(null)).toBe(localForgeProvider);
    expect(forgeProviderForConnection(undefined)).toBe(localForgeProvider);
    expect(forgeProviderForConnection("local")).toBe(localForgeProvider);
  });

  it("resolves relayed connections to the relay provider when the relay is configured", () => {
    expect(
      forgeProviderForConnection("relay", {
        MINDDY_FORGE_RELAY_URL: "https://relay.example.com",
        MINDDY_FORGE_RELAY_INSTANCE_ID: "instance",
        MINDDY_FORGE_RELAY_SECRET: "secret",
      }),
    ).toBe(relayForgeProvider);
  });

  it("never falls back to the local provider for a relayed connection", () => {
    expect(() => forgeProviderForConnection("relay", {})).toThrow(
      /MINDDY_FORGE_RELAY_/,
    );
  });
});

describe("RelayForgeProvider", () => {
  it("mints GitHub tokens through the control plane, scoped per request", async () => {
    const result = await relayForgeProvider.getInstallationToken({
      installationId: 4242,
      scope: { repositoryIds: [9001], permissions: { contents: "write" } },
    });
    expect(result).toEqual({
      token: "relayed-token",
      expiresAt: "2026-08-21T12:00:00Z",
    });
    expect(relayRequestCalls).toEqual([
      {
        path: "/api/relay/github/installation-token",
        body: {
          installationId: 4242,
          repositoryIds: [9001],
          profile: "repo-write",
        },
      },
    ]);
    expect(installationTokenCalls).toHaveLength(0);
  });

  it("uses the narrow pre-link profile for repository enumeration", async () => {
    await relayForgeProvider.getInstallationToken({ installationId: 5252 });
    expect(relayRequestCalls).toEqual([
      {
        path: "/api/relay/github/installation-token",
        body: {
          installationId: 5252,
          repositoryIds: [],
          profile: "repository-list",
        },
      },
    ]);
  });

  it("keeps GitLab tokens instance-side — the relay never sees them", async () => {
    await expect(
      relayForgeProvider.getGitlabAccessToken("conn-1"),
    ).resolves.toBe("gitlab-connection-token");
    expect(gitlabTokenCalls).toEqual(["conn-1"]);
    expect(relayRequestCalls).toHaveLength(0);
  });

  it("surfaces a relay refusal instead of a silent local mint", async () => {
    relayResponse = { ok: false, error: "Repository not linked", data: null };
    await expect(
      relayForgeProvider.getInstallationToken({ installationId: 4242 }),
    ).rejects.toThrow(/not linked/);
    expect(installationTokenCalls).toHaveLength(0);
  });

  it("coalesces concurrent mints for the same installation and scope", async () => {
    let release!: () => void;
    relayGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const input = {
      installationId: 7777,
      scope: { repositoryIds: [123], permissions: { contents: "read" as const } },
    };

    const first = relayForgeProvider.getInstallationToken(input);
    const second = relayForgeProvider.getInstallationToken(input);
    await vi.waitFor(() => expect(relayRequestCalls).toHaveLength(1));
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ token: "relayed-token" }),
      expect.objectContaining({ token: "relayed-token" }),
    ]);
    expect(relayRequestCalls).toHaveLength(1);
  });

  it("bounds the resolved relay-token cache", async () => {
    for (let installationId = 10_000; installationId <= 10_500; installationId += 1) {
      await relayForgeProvider.getInstallationToken({ installationId });
    }
    expect(__relayTokenCacheSizeForTests()).toBeGreaterThan(0);
    expect(__relayTokenCacheSizeForTests()).toBeLessThanOrEqual(500);
  });
});

describe("repo-access through the seam", () => {
  it("mints the same scoped GitHub token as before the seam", async () => {
    linkRow = {
      id: "link-1",
      provider: "github",
      connection_id: "conn-1",
      installation_id: 42,
      external_repo_id: "9001",
      repo_full_name: "acme/app",
      default_branch: "trunk",
    };
    const target = await resolveRepoCloneTarget("project-1", "repo-write");
    expect(installationTokenCalls).toEqual([
      {
        installationId: 42,
        scope: { repositoryIds: [9001], permissions: { contents: "write" } },
      },
    ]);
    expect(target).toMatchObject({
      provider: "github",
      repoFullName: "acme/app",
      defaultBranch: "trunk",
      token: "installation-token",
      authUrl: "https://x-access-token:installation-token@github.com/acme/app.git",
    });
  });

  it("routes a relayed connection's GitHub mints through the control plane", async () => {
    vi.stubEnv("MINDDY_FORGE_RELAY_URL", "https://relay.example.com");
    vi.stubEnv("MINDDY_FORGE_RELAY_INSTANCE_ID", "instance");
    vi.stubEnv("MINDDY_FORGE_RELAY_SECRET", "secret");
    linkRow = {
      id: "link-3",
      provider: "github",
      connection_id: "conn-3",
      installation_id: 4242,
      external_repo_id: "9001",
      repo_full_name: "acme/app",
      default_branch: "main",
      git_connections: { source: "relay" },
    };
    const target = await resolveRepoCloneTarget("project-1", "repo-read");
    expect(relayRequestCalls).toEqual([
      {
        path: "/api/relay/github/installation-token",
        body: {
          installationId: 4242,
          repositoryIds: [9001],
          profile: "repo-read",
        },
      },
    ]);
    expect(installationTokenCalls).toHaveLength(0);
    expect(target).toMatchObject({
      provider: "github",
      token: "relayed-token",
      authUrl: "https://x-access-token:relayed-token@github.com/acme/app.git",
    });
    vi.unstubAllEnvs();
  });

  it("mints the same GitLab connection token as before the seam", async () => {
    linkRow = {
      id: "link-2",
      provider: "gitlab",
      connection_id: "conn-2",
      installation_id: null,
      repo_full_name: "acme/app",
      default_branch: null,
    };
    const target = await resolveRepoCloneTarget("project-1");
    expect(gitlabTokenCalls).toEqual(["conn-2"]);
    expect(target).toMatchObject({
      provider: "gitlab",
      token: "gitlab-connection-token",
      defaultBranch: "main",
      authUrl: "https://oauth2:gitlab-connection-token@gitlab.com/acme/app.git",
    });
  });
});
