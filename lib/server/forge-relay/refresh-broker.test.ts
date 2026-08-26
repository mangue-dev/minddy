import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeRpc,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Relay-brokered OAuth token refresh (docs/managed-forge-relay-plan.md).
 * Pinned: only tokens whose lineage traces to a delivery handed to THIS
 * instance are refreshable (fail-closed, audited); a successful rotation
 * advances the stored hash; the signed route honors the kill switch.
 */

vi.stubEnv("GITLAB_OAUTH_CLIENT_ID", "gitlab-client-id");
vi.stubEnv("GITLAB_OAUTH_CLIENT_SECRET", "gitlab-client-secret");
vi.stubEnv("GITHUB_APP_CLIENT_ID", "github-client-id");
vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "github-client-secret");

let forgeEnabled = true;
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => new FakeQuery(name),
    rpc: fakeRpc,
  }),
}));

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

const DEFAULT_FETCH = async (url: string | URL): Promise<Response> => {
  const target = String(url);
  if (target.includes("gitlab.com")) {
    return Response.json({
      access_token: "gitlab-new-access",
      refresh_token: "gitlab-new-refresh",
      expires_in: 7200,
      scope: "api",
    });
  }
  return Response.json({
    access_token: "github-new-access",
    refresh_token: "github-new-refresh",
    expires_in: 28800,
    scope: "",
  });
};

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
/** Swapped by the provider-failure test; every call goes through this. */
let fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response> =
  DEFAULT_FETCH;

vi.stubGlobal(
  "fetch",
  (url: string | URL, init?: RequestInit) => {
    const response = fetchImpl(url, init);
    fetchCalls.push({ url: String(url), init: init ?? {} });
    return response;
  },
);

const { hashRefreshToken, refreshGitlabTokensWithManagedApp } = await import(
  "./oauth-refresh"
);
const { brokerTokenRefresh } = await import("./refresh-broker");

function seedLineage(refreshToken: string): void {
  setFakeTable("forge_relay_refresh_lineage", [
    {
      id: "lineage-1",
      instance_id: INSTANCE_ID,
      provider: "gitlab",
      provider_account_id: "777",
      refresh_token_hash: hashRefreshToken(refreshToken),
      updated_at: new Date().toISOString(),
    },
  ]);
}

beforeEach(() => {
  forgeEnabled = true;
  fetchCalls = [];
  fetchImpl = DEFAULT_FETCH;
  setFakeTable("forge_relay_refresh_lineage", []);
  setFakeTable("forge_relay_audit", []);
});

describe("brokerTokenRefresh", () => {
  it("refuses a refresh token that was never issued to this instance", async () => {
    const result = await brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "gitlab",
      refreshToken: "foreign-refresh-token-value",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(fetchCalls).toHaveLength(0);
    // Refusals are audited: an instance cannot probe tokens silently.
    expect(fakeTables["forge_relay_audit"]?.[0]).toMatchObject({
      action: "token_refresh_refused",
    });
  });

  it("refuses a lineage belonging to ANOTHER instance even with the same token", async () => {
    seedLineage("shared-refresh-token-value");
    const result = await brokerTokenRefresh({
      instanceId: "11111111-1111-4111-8111-111111111111",
      provider: "gitlab",
      refreshToken: "shared-refresh-token-value",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("runs the GitLab grant with the managed app and advances the lineage", async () => {
    seedLineage("current-gitlab-refresh");
    const result = await brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "gitlab",
      refreshToken: "current-gitlab-refresh",
    });
    expect(result).toMatchObject({
      ok: true,
      tokens: {
        accessToken: "gitlab-new-access",
        refreshToken: "gitlab-new-refresh",
        scope: "api",
      },
    });
    // The client credentials never appear in a response — they stay on Cloud.
    expect(fetchCalls[0]?.init.body).toContain("client_secret=gitlab-client-secret");

    const lineage = fakeTables["forge_relay_refresh_lineage"]?.[0] as Record<
      string,
      unknown
    >;
    expect(lineage.refresh_token_hash).toBe(hashRefreshToken("gitlab-new-refresh"));
  });

  it("runs the GitHub grant through the same lineage check", async () => {
    setFakeTable("forge_relay_refresh_lineage", [
      {
        id: "lineage-gh",
        instance_id: INSTANCE_ID,
        provider: "github",
        provider_account_id: "42",
        refresh_token_hash: hashRefreshToken("current-github-refresh"),
        updated_at: new Date().toISOString(),
      },
    ]);
    const result = await brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "github",
      refreshToken: "current-github-refresh",
    });
    expect(result).toMatchObject({
      ok: true,
      tokens: { accessToken: "github-new-access" },
    });
    const lineage = fakeTables["forge_relay_refresh_lineage"]?.[0] as Record<
      string,
      unknown
    >;
    expect(lineage.refresh_token_hash).toBe(hashRefreshToken("github-new-refresh"));
  });

  it("reports a provider failure without corrupting the lineage", async () => {
    seedLineage("doomed-refresh");
    fetchImpl = async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }) as unknown as Response;
    const result = await brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "gitlab",
      refreshToken: "doomed-refresh",
    });
    expect(result).toMatchObject({ ok: false, status: 502 });
    const lineage = fakeTables["forge_relay_refresh_lineage"]?.[0] as Record<
      string,
      unknown
    >;
    expect(lineage.refresh_token_hash).toBe(hashRefreshToken("doomed-refresh"));
  });

  it("admits only one provider refresh for a token lineage", async () => {
    seedLineage("single-use-refresh");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchImpl = async (url) => {
      await gate;
      return DEFAULT_FETCH(url);
    };

    const winner = brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "gitlab",
      refreshToken: "single-use-refresh",
    });
    await vi.waitFor(() => expect(fetchCalls).toHaveLength(1));
    const duplicate = await brokerTokenRefresh({
      instanceId: INSTANCE_ID,
      provider: "gitlab",
      refreshToken: "single-use-refresh",
    });
    expect(duplicate).toMatchObject({ ok: false, status: 409 });
    expect(fetchCalls).toHaveLength(1);

    release();
    await expect(winner).resolves.toMatchObject({ ok: true });
  });
});

describe("refreshGitlabTokensWithManagedApp", () => {
  it("sends the refresh grant to gitlab.com with the managed credentials", async () => {
    const tokens = await refreshGitlabTokensWithManagedApp("some-refresh");
    expect(tokens.accessToken).toBe("gitlab-new-access");
    expect(tokens.refreshToken).toBe("gitlab-new-refresh");
    expect(tokens.expiresAt).toBeTruthy();
    const body = String(fetchCalls[0]?.init.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_id=gitlab-client-id");
  });
});

// ── Signed routes ───────────────────────────────────────────────────────────

function generateInstanceKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
const { signRelayRequest } = await import("./protocol");
const { POST: gitlabRefreshRoute } = await import(
  "@/app/api/relay/gitlab/refresh/route"
);
const { POST: githubRefreshRoute } = await import(
  "@/app/api/relay/github/user-refresh/route"
);

function signedRequest(path: string, rawBody: string): Request {
  const signature = signRelayRequest({
    method: "POST",
    path,
    rawBody,
    instanceId: INSTANCE_ID,
    privateKey: privateKeyPem,
  });
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: signature,
    body: rawBody,
  }) as unknown as Request;
}

describe("POST /api/relay/gitlab/refresh", () => {
  beforeEach(() => {
    setFakeTable("forge_relay_instances", [
      {
        id: INSTANCE_ID,
        name: "on-prem",
        public_key: publicKeyPem,
        status: "active",
      },
    ]);
    setFakeTable("forge_relay_nonces", []);
    seedLineage("route-lineage-refresh");
  });

  it("stays unavailable when the managed forge relay is not configured", async () => {
    forgeEnabled = false;
    const response = await gitlabRefreshRoute(
      signedRequest("/api/relay/gitlab/refresh", JSON.stringify({ refreshToken: "x".repeat(24) })) as never,
    );
    expect(response.status).toBe(503);
  });

  it("rejects an unsigned request and a malformed body", async () => {
    const unsigned = await gitlabRefreshRoute(
      new Request("http://localhost/api/relay/gitlab/refresh", {
        method: "POST",
        body: "{}",
      }) as never,
    );
    expect(unsigned.status).toBe(401);

    const malformed = await gitlabRefreshRoute(
      signedRequest("/api/relay/gitlab/refresh", JSON.stringify({ refreshToken: "short" })) as never,
    );
    expect(malformed.status).toBe(400);
  });

  it("rejects oversized refresh bodies before signature verification", async () => {
    const body = "x".repeat(8 * 1024 + 1);
    const request = new Request("http://localhost/api/relay/gitlab/refresh", {
      method: "POST",
      headers: { "content-length": String(body.length) },
      body,
    });

    expect((await gitlabRefreshRoute(request as never)).status).toBe(413);
    expect(fakeTables.forge_relay_nonces).toHaveLength(0);
  });

  it("refreshes over the signed channel end to end", async () => {
    const response = await gitlabRefreshRoute(
      signedRequest(
        "/api/relay/gitlab/refresh",
        JSON.stringify({ refreshToken: "route-lineage-refresh" }),
      ) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accessToken: "gitlab-new-access",
      refreshToken: "gitlab-new-refresh",
    });
  });

  it("refuses a foreign refresh token over the signed channel", async () => {
    const response = await gitlabRefreshRoute(
      signedRequest(
        "/api/relay/gitlab/refresh",
        JSON.stringify({ refreshToken: "never-issued-to-this-instance" }),
      ) as never,
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /api/relay/github/user-refresh", () => {
  it("applies the same body ceiling before buffering", async () => {
    const body = "x".repeat(8 * 1024 + 1);
    const response = await githubRefreshRoute(
      new Request("http://localhost/api/relay/github/user-refresh", {
        method: "POST",
        headers: { "content-length": String(body.length) },
        body,
      }) as never,
    );

    expect(response.status).toBe(413);
  });
});
