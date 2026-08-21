import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Instance side of the relay-brokered OAuth refresh
 * (docs/managed-forge-relay-plan.md). Pinned: a connection or identity marked
 * `source: "relay"` refreshes through the signed relay channel — its grant
 * belongs to the MANAGED app's client, so a local grant would fail (no local
 * credentials) — while `local` rows keep refreshing directly.
 */

vi.stubEnv("GITLAB_OAUTH_CLIENT_ID", "client-id");
vi.stubEnv("GITLAB_OAUTH_CLIENT_SECRET", "client-secret");
vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");
// The LOCAL GitHub refresh grant goes through the real `requestUserToken`,
// which guards on the local App capability.
vi.stubEnv("GITHUB_APP_ID", "123456");
vi.stubEnv("GITHUB_APP_SLUG", "minddy");
vi.stubEnv(
  "GITHUB_APP_PRIVATE_KEY",
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIJ-private-key-material-for-the-test\n-----END PRIVATE KEY-----\n",
);
vi.stubEnv("GITHUB_APP_CLIENT_ID", "Iv1.local-client-id");
vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "local-client-secret");

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

const relayCalls: { path: string; body: Record<string, unknown> }[] = [];
let relayResponse: { ok: boolean; error: string | null; data: unknown } = {
  ok: true,
  error: null,
  data: null,
};

vi.mock("@/lib/server/forge-relay/client", () => ({
  forgeRelayConfig: () => ({
    url: "https://relay.example.com",
    instanceId: "instance",
    secret: "secret",
  }),
  isForgeRelayClientConfigured: () => true,
  relayRequest: async (path: string, body: Record<string, unknown>) => {
    relayCalls.push({ path, body });
    return relayResponse;
  },
}));

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];

vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), init: init ?? {} });
  const target = String(url);
  if (target.includes("/oauth/token")) {
    return Response.json({
      access_token: "direct-new-access",
      refresh_token: "direct-new-refresh",
      expires_in: 7200,
      scope: "api",
    });
  }
  return Response.json({
    access_token: "direct-user-access",
    refresh_token: "direct-user-refresh",
    expires_in: 28800,
    scope: "",
  });
});

const { encryptForgeToken, decryptForgeToken } = await import("./token-crypto");

/** An already-expired token: every mint below takes the refresh path. */
function expired(): string {
  return new Date(Date.now() - 60 * 60_000).toISOString();
}

beforeEach(() => {
  relayCalls.length = 0;
  fetchCalls = [];
  relayResponse = { ok: true, error: null, data: null };
  setFakeTable("git_connections", []);
  setFakeTable("git_user_identities", []);
});

describe("getGitlabAccessToken — refresh routing by connection source", () => {
  it("refreshes a RELAYED connection through the signed channel", async () => {
    setFakeTable("git_connections", [
      {
        id: "conn-gl",
        provider: "gitlab",
        source: "relay",
        access_token_encrypted: encryptForgeToken("stale-access"),
        refresh_token_encrypted: encryptForgeToken("relayed-refresh"),
        token_expires_at: expired(),
      },
    ]);
    relayResponse = {
      ok: true,
      error: null,
      data: {
        accessToken: "relayed-new-access",
        refreshToken: "relayed-new-refresh",
        expiresAt: new Date(Date.now() + 7200_000).toISOString(),
        scope: "api",
      },
    };

    const { getGitlabAccessToken } = await import("./gitlab-app");
    await expect(getGitlabAccessToken("conn-gl")).resolves.toBe("relayed-new-access");
    expect(relayCalls).toEqual([
      { path: "/api/relay/gitlab/refresh", body: { refreshToken: "relayed-refresh" } },
    ]);
    expect(fetchCalls).toHaveLength(0);

    // The rotated pair is persisted instance-side, encrypted as always.
    const row = fakeTables["git_connections"]?.[0] as Record<string, unknown>;
    expect(decryptForgeToken(row.access_token_encrypted as string)).toBe(
      "relayed-new-access",
    );
    expect(decryptForgeToken(row.refresh_token_encrypted as string)).toBe(
      "relayed-new-refresh",
    );
  });

  it("keeps refreshing a LOCAL connection directly against GitLab", async () => {
    setFakeTable("git_connections", [
      {
        id: "conn-local",
        provider: "gitlab",
        source: "local",
        access_token_encrypted: encryptForgeToken("stale-access"),
        refresh_token_encrypted: encryptForgeToken("local-refresh"),
        token_expires_at: expired(),
      },
    ]);

    const { getGitlabAccessToken } = await import("./gitlab-app");
    await expect(getGitlabAccessToken("conn-local")).resolves.toBe("direct-new-access");
    expect(relayCalls).toHaveLength(0);
    expect(fetchCalls[0]?.url).toContain("/oauth/token");
  });

  it("surfaces the relay refusal instead of falling back to a local grant", async () => {
    setFakeTable("git_connections", [
      {
        id: "conn-gl",
        provider: "gitlab",
        source: "relay",
        access_token_encrypted: encryptForgeToken("stale-access"),
        refresh_token_encrypted: encryptForgeToken("relayed-refresh"),
        token_expires_at: expired(),
      },
    ]);
    relayResponse = { ok: false, error: "not issued to this instance", data: null };

    const { getGitlabAccessToken } = await import("./gitlab-app");
    await expect(getGitlabAccessToken("conn-gl")).rejects.toThrow(
      /not issued to this instance/,
    );
    // The single-use rotation recovery rereads once — still nothing usable.
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("getGithubUserToken — refresh routing by identity source", () => {
  it("refreshes a RELAYED identity through the signed channel", async () => {
    setFakeTable("git_user_identities", [
      {
        id: "ident-1",
        user_id: "user-1",
        provider: "github",
        source: "relay",
        account_login: "octo",
        account_avatar_url: null,
        access_token_encrypted: encryptForgeToken("stale-user-token"),
        refresh_token_encrypted: encryptForgeToken("relayed-user-refresh"),
        token_expires_at: expired(),
      },
    ]);
    relayResponse = {
      ok: true,
      error: null,
      data: {
        accessToken: "relayed-user-access",
        refreshToken: "relayed-user-refresh-new",
        expiresAt: new Date(Date.now() + 28800_000).toISOString(),
        scope: "",
      },
    };

    const { getGithubUserToken } = await import("./user-identities");
    await expect(getGithubUserToken("user-1")).resolves.toMatchObject({
      token: "relayed-user-access",
      login: "octo",
    });
    expect(relayCalls).toEqual([
      { path: "/api/relay/github/user-refresh", body: { refreshToken: "relayed-user-refresh" } },
    ]);
    expect(fetchCalls).toHaveLength(0);
  });

  it("keeps refreshing a LOCAL identity directly against GitHub", async () => {
    setFakeTable("git_user_identities", [
      {
        id: "ident-2",
        user_id: "user-2",
        provider: "github",
        source: "local",
        account_login: "octo",
        account_avatar_url: null,
        access_token_encrypted: encryptForgeToken("stale-user-token"),
        refresh_token_encrypted: encryptForgeToken("local-user-refresh"),
        token_expires_at: expired(),
      },
    ]);

    const { getGithubUserToken } = await import("./user-identities");
    await expect(getGithubUserToken("user-2")).resolves.toMatchObject({
      token: "direct-user-access",
    });
    expect(relayCalls).toHaveLength(0);
    expect(fetchCalls[0]?.url).toContain("github.com/login/oauth/access_token");
  });
});
