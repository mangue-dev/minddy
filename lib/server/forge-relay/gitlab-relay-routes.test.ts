import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Routes of the GitLab broker + webhook relay (Phase 5). The full chain is
 * exercised: instance-signed state → Cloud authorize redirect → GitLab
 * callback → encrypted delivery → signed fetch → hook-secret registration →
 * relay webhook verification and enqueue.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const HOOK_SECRET = "per-repo-hook-secret-0123456789abcdef";

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

let forgeEnabled = true;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/server/app-origin", () => ({
  canonicalAppOrigin: () => "https://cloud.example.com",
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAuthorizeUrl: ({ redirectUri, state }: { redirectUri: string; state: string }) =>
    `https://gitlab.com/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
  exchangeGitlabCode: async () => ({
    accessToken: "gitlab-access-token",
    refreshToken: "gitlab-refresh-token",
    expiresAt: "2026-08-21T20:00:00Z",
    scope: "api",
  }),
  getGitlabUser: async () => ({ id: 42, username: "octo" }),
}));

const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

function seedInstance(): void {
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: publicKeyPem,
      status: "active",
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  ]);
  setFakeTable("forge_relay_user_deliveries", []);
  setFakeTable("forge_relay_link_mirror", []);
  setFakeTable("forge_relay_deliveries", []);
}

const { signRelayGitlabState, signCloudGitlabState } = await import(
  "@/lib/server/forge-relay/gitlab-broker"
);
const { signRelayRequest } = await import("@/lib/server/forge-relay/protocol");
const { GET: cloudAuthorize } = await import("@/app/api/relay/gitlab/authorize/route");
const { GET: cloudCallback } = await import("@/app/api/relay/gitlab/callback/route");
const { POST: cloudDelivery } = await import("@/app/api/relay/gitlab/delivery/route");
const { POST: hookSecret } = await import("@/app/api/relay/gitlab/hook-secret/route");
const { POST: relayWebhook } = await import("@/app/api/relay/gitlab/webhook/route");

function getRequest(url: string): never {
  return { nextUrl: new URL(url) } as never;
}

beforeEach(() => {
  forgeEnabled = true;
  seedInstance();
});

describe("GET /api/relay/gitlab/authorize", () => {
  it("redirects to GitLab with the Cloud callback URI after verifying the signature", async () => {
    const state = signRelayGitlabState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    const response = await cloudAuthorize(
      getRequest(`https://cloud.example.com/api/relay/gitlab/authorize?instance=${INSTANCE_ID}&state=${encodeURIComponent(state)}`),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe("https://gitlab.com/oauth/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://cloud.example.com/api/relay/gitlab/callback",
    );
  });

  it("refuses an unverifiable state", async () => {
    const response = await cloudAuthorize(
      getRequest("https://cloud.example.com/api/relay/gitlab/authorize?instance=x&state=y"),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/relay/gitlab/callback", () => {
  it("exchanges the code and parks an ENCRYPTED delivery for the instance", async () => {
    const state = signCloudGitlabState({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
    });
    const response = await cloudCallback(
      getRequest(`https://cloud.example.com/api/relay/gitlab/callback?code=oauth-code&state=${encodeURIComponent(state)}`),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("https://on-prem.example.com/api/git/gitlab/relay-callback?delivery=");

    const row = fakeTables["forge_relay_user_deliveries"]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({ provider: "gitlab", user_id: "user-on-instance" });
    expect(String(row.access_token_encrypted)).not.toContain("gitlab-access-token");
  });

  it("refuses an invalid state without exchanging anything", async () => {
    const response = await cloudCallback(
      getRequest("https://cloud.example.com/api/relay/gitlab/callback?code=oauth-code&state=nope"),
    );
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_user_deliveries"] ?? []).toHaveLength(0);
  });
});

describe("POST /api/relay/gitlab/delivery", () => {
  it("hands the token pair to its instance over the signed channel", async () => {
    const { createGitlabTokenDelivery } = await import("@/lib/server/forge-relay/gitlab-broker");
    const deliveryId = await createGitlabTokenDelivery({
      instanceId: INSTANCE_ID,
      delivery: {
        userId: "user-on-instance",
        account: { id: 42, login: "octo", avatarUrl: null },
        tokens: {
          accessToken: "gitlab-access-token",
          refreshToken: "gitlab-refresh-token",
          expiresAt: "2026-08-21T20:00:00Z",
          scope: "api",
        },
      },
    });
    const rawBody = JSON.stringify({ deliveryId });
    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/gitlab/delivery",
      rawBody,
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    const response = await cloudDelivery(
      new Request("http://localhost/api/relay/gitlab/delivery", {
        method: "POST",
        headers: signature,
        body: rawBody,
      }) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "delivered",
      delivery: { userId: "user-on-instance" },
    });
  });
});

describe("POST /api/relay/gitlab/hook-secret", () => {
  it("records the per-repo secret for the signing instance", async () => {
    const rawBody = JSON.stringify({ repoId: "1001", repo: "acme/app", secret: HOOK_SECRET });
    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/gitlab/hook-secret",
      rawBody,
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    const response = await hookSecret(
      new Request("http://localhost/api/relay/gitlab/hook-secret", {
        method: "POST",
        headers: signature,
        body: rawBody,
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(fakeTables["forge_relay_link_mirror"]?.[0]).toMatchObject({
      provider: "gitlab",
      external_repo_id: "1001",
      repo_full_name: "acme/app",
    });
  });
});

describe("POST /api/relay/gitlab/webhook", () => {
  function webhookRequest(token: string | null, repo = "acme/app") {
    const headers = new Headers({ "content-type": "application/json" });
    if (token !== null) headers.set("x-gitlab-token", token);
    headers.set("x-gitlab-event", "merge_request");
    headers.set("x-gitlab-event-uuid", crypto.randomUUID());
    return new Request("http://localhost/api/relay/gitlab/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify({
        object_kind: "merge_request",
        project: {
          id: repo === "other/repo" ? 2002 : 1001,
          path_with_namespace: repo,
        },
      }),
    }) as never;
  }

  it("verifies the per-repo token and enqueues one delivery per claiming instance", async () => {
    await registerAndMirror();
    const response = await relayWebhook(webhookRequest(HOOK_SECRET));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, relayed: 1 });
    expect(fakeTables["forge_relay_deliveries"]?.[0]).toMatchObject({
      provider: "gitlab",
      instance_id: INSTANCE_ID,
    });
  });

  it("fails closed on a wrong token or an unknown repository", async () => {
    await registerAndMirror();
    expect((await relayWebhook(webhookRequest("wrong-secret"))).status).toBe(401);
    // Unknown repository: same 401 as a wrong token — no repo existence oracle.
    expect((await relayWebhook(webhookRequest(HOOK_SECRET, "other/repo"))).status).toBe(401);
    expect(fakeTables["forge_relay_deliveries"] ?? []).toHaveLength(0);
  });

  it("authenticates before parsing and never decrypts candidate secrets", async () => {
    await registerAndMirror();
    const row = fakeTables.forge_relay_link_mirror?.[0] as Record<string, unknown>;
    row.webhook_secret_encrypted = "not-valid-ciphertext";

    const malformed = new Request("http://localhost/api/relay/gitlab/webhook", {
      method: "POST",
      headers: { "x-gitlab-token": "wrong-secret" },
      body: "not-json",
    });
    expect((await relayWebhook(malformed as never)).status).toBe(401);

    const response = await relayWebhook(webhookRequest(HOOK_SECRET));
    expect(response.status).toBe(200);
  });

  it("rejects an oversized authenticated webhook before parsing", async () => {
    await registerAndMirror();
    const response = await relayWebhook(
      new Request("http://localhost/api/relay/gitlab/webhook", {
        method: "POST",
        headers: {
          "content-length": String(2 * 1024 * 1024 + 1),
          "x-gitlab-token": HOOK_SECRET,
        },
        body: "{}",
      }) as never,
    );

    expect(response.status).toBe(413);
    expect(fakeTables.forge_relay_deliveries ?? []).toHaveLength(0);
  });

  async function registerAndMirror(): Promise<void> {
    const { registerGitlabHookSecret } = await import("@/lib/server/forge-relay/gitlab-broker");
    await registerGitlabHookSecret({
      instanceId: INSTANCE_ID,
      repoId: "1001",
      repo: "acme/app",
      secret: HOOK_SECRET,
    });
  }
});
