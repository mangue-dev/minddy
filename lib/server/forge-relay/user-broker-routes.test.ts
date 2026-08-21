import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Routes of the user-authorization broker
 * (docs/managed-forge-relay-plan.md, "User authorization (human gestures)").
 * The full chain is exercised: instance-signed state → Cloud authorize
 * redirect → GitHub callback → encrypted delivery → instance fetch over the
 * signed channel → local identity storage.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");
vi.stubEnv("GITHUB_APP_CLIENT_ID", "app-client-id");

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

vi.mock("@/lib/server/git/github-user-auth", () => ({
  getGithubUserAuthorizeUrl: ({ redirectUri, state }: { redirectUri: string; state: string }) =>
    `https://github.com/login/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&client_id=app-client-id`,
  exchangeGithubUserCode: async () => ({
    accessToken: "user-access-token",
    expiresAt: null,
    refreshToken: "user-refresh-token",
    scope: "",
  }),
  getGithubUserAccount: async () => ({ id: 777, login: "octo", avatarUrl: null }),
}));

const upsertUserIdentity = vi.fn();
vi.mock("@/lib/server/git/user-identities", () => ({
  upsertUserIdentity: (...args: unknown[]) => upsertUserIdentity(...args),
}));

// Instance-side client: the private key is a REAL Ed25519 key so signatures
// made by the tests verify against the registered public key.
const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

const relayCalls: { path: string; body: Record<string, unknown> }[] = [];
let relayResponse: { ok: boolean; error: string | null; data: unknown } = {
  ok: true,
  error: null,
  data: { status: "pending" },
};

vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => true,
  forgeRelayConfig: () => ({
    url: "https://relay.example.com",
    instanceId: INSTANCE_ID,
    secret: privateKeyPem,
  }),
  forgeRelaySigningKey: () => privateKeyPem,
  relayRequest: async (path: string, body: Record<string, unknown>) => {
    relayCalls.push({ path, body });
    return relayResponse;
  },
}));

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
}

const { signRelayUserState } = await import("@/lib/server/forge-relay/user-broker");
const { signRelayRequest } = await import("@/lib/server/forge-relay/protocol");
const { GET: cloudAuthorize } = await import(
  "@/app/api/relay/github/user-authorize/route"
);
const { GET: cloudUserCallback } = await import(
  "@/app/api/relay/github/user-callback/route"
);
const { POST: cloudUserDelivery } = await import(
  "@/app/api/relay/github/user-delivery/route"
);
const { GET: instanceUserCallback } = await import(
  "@/app/api/git/github/relay-user-callback/route"
);

function getRequest(url: string): never {
  return { nextUrl: new URL(url) } as never;
}

function signedDeliveryRequest(rawBody: string): Request {
  const signature = signRelayRequest({
    method: "POST",
    path: "/api/relay/github/user-delivery",
    rawBody,
    instanceId: INSTANCE_ID,
    privateKey: privateKeyPem,
  });
  return new Request("http://localhost/api/relay/github/user-delivery", {
    method: "POST",
    headers: signature,
    body: rawBody,
  }) as never;
}

beforeEach(() => {
  forgeEnabled = true;
  relayCalls.length = 0;
  relayResponse = { ok: true, error: null, data: { status: "pending" } };
  upsertUserIdentity.mockReset();
  seedInstance();
});

describe("GET /api/relay/github/user-authorize", () => {
  it("redirects to GitHub with the Cloud callback URL after verifying the instance signature", async () => {
    const state = signRelayUserState({
      userId: "user-on-instance",
      origin: "settings",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    const response = await cloudAuthorize(
      getRequest(`https://cloud.example.com/api/relay/github/user-authorize?instance=${INSTANCE_ID}&state=${encodeURIComponent(state)}`),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("app-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://cloud.example.com/api/relay/github/user-callback",
    );
  });

  it("refuses an unverifiable state and stays unavailable without the managed forge", async () => {
    const bad = await cloudAuthorize(
      getRequest("https://cloud.example.com/api/relay/github/user-authorize?instance=x&state=y"),
    );
    expect(bad.status).toBe(400);

    forgeEnabled = false;
    const state = signRelayUserState({
      userId: "u",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    const disabled = await cloudAuthorize(
      getRequest(`https://cloud.example.com/api/relay/github/user-authorize?instance=${INSTANCE_ID}&state=${state}`),
    );
    expect(disabled.status).toBe(503);
  });
});

describe("GET /api/relay/github/user-callback", () => {
  it("exchanges the code, parks an ENCRYPTED delivery, and bounces to the instance", async () => {
    const { signCloudUserState } = await import("@/lib/server/forge-relay/user-broker");
    const state = signCloudUserState({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      origin: "settings",
      callbackOrigin: "https://on-prem.example.com",
    });
    const response = await cloudUserCallback(
      getRequest(`https://cloud.example.com/api/relay/github/user-callback?code=oauth-code&state=${encodeURIComponent(state)}`),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("https://on-prem.example.com/api/git/github/relay-user-callback?delivery=");

    const row = fakeTables["forge_relay_user_deliveries"]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({ instance_id: INSTANCE_ID, user_id: "user-on-instance" });
    expect(String(row.access_token_encrypted)).not.toContain("user-access-token");
  });

  it("refuses an invalid state without exchanging anything", async () => {
    const response = await cloudUserCallback(
      getRequest("https://cloud.example.com/api/relay/github/user-callback?code=oauth-code&state=nope"),
    );
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_user_deliveries"] ?? []).toHaveLength(0);
  });
});

describe("POST /api/relay/github/user-delivery", () => {
  it("hands the token set to its instance over the signed channel", async () => {
    const { createUserDelivery } = await import("@/lib/server/forge-relay/user-broker");
    const deliveryId = await createUserDelivery({
      instanceId: INSTANCE_ID,
      delivery: {
        userId: "user-on-instance",
        account: { id: 777, login: "octo", avatarUrl: null },
        tokens: {
          accessToken: "user-access-token",
          expiresAt: null,
          refreshToken: "user-refresh-token",
          scope: "",
        },
      },
    });

    const response = await cloudUserDelivery(
      signedDeliveryRequest(JSON.stringify({ deliveryId })) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "delivered",
      delivery: { userId: "user-on-instance" },
    });
  });

  it("rejects an unsigned request", async () => {
    const response = await cloudUserDelivery(
      new Request("http://localhost/api/relay/github/user-delivery", {
        method: "POST",
        body: JSON.stringify({ deliveryId: crypto.randomUUID() }),
      }) as never,
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /api/git/github/relay-user-callback (instance)", () => {
  it("stores the identity locally and returns the user to settings", async () => {
    relayResponse = {
      ok: true,
      error: null,
      data: {
        status: "delivered",
        userId: "user-on-instance",
        account: { id: 777, login: "octo", avatarUrl: null },
        tokens: {
          accessToken: "user-access-token",
          expiresAt: null,
          refreshToken: "user-refresh-token",
          scope: "",
        },
      },
    };
    const response = await instanceUserCallback(
      getRequest(`http://localhost/api/git/github/relay-user-callback?delivery=${crypto.randomUUID()}`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("settings?tab=git&git=connected");
    expect(upsertUserIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-on-instance",
        provider: "github",
        providerAccountId: "777",
        tokens: expect.objectContaining({ accessToken: "user-access-token" }),
      }),
    );
    expect(relayCalls).toEqual([
      { path: "/api/relay/github/user-delivery", body: { deliveryId: expect.any(String) } },
    ]);
  });

  it("returns the user to settings with an error when the delivery is unavailable", async () => {
    const response = await instanceUserCallback(
      getRequest(`http://localhost/api/git/github/relay-user-callback?delivery=${crypto.randomUUID()}`),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("git=error");
    expect(upsertUserIdentity).not.toHaveBeenCalled();
  });
});
