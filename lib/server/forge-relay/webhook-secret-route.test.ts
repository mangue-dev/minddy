import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * `POST /api/relay/webhook-secret` — the instance registers (or rotates) its
 * fan-out endpoint over the signed channel. Pinned: the endpoint must be
 * HTTPS and resolve only to public addresses. A malformed body from an
 * authenticated instance is a 400, not a 500.
 */

vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

let forgeEnabled = true;
const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const SECRET = "instance-generated-webhook-secret-32ch";

function generateInstanceKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
const { signRelayRequest } = await import("./protocol");
const route = (await import("@/app/api/relay/webhook-secret/route")).POST;

function signedRequest(rawBody: string): Request {
  const signature = signRelayRequest({
    method: "POST",
    path: "/api/relay/webhook-secret",
    rawBody,
    instanceId: INSTANCE_ID,
    privateKey: privateKeyPem,
  });
  return new Request("http://localhost/api/relay/webhook-secret", {
    method: "POST",
    headers: signature,
    body: rawBody,
  }) as unknown as Request;
}

beforeEach(() => {
  forgeEnabled = true;
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: publicKeyPem,
      status: "active",
      webhook_url: null,
      webhook_secret_encrypted: null,
    },
  ]);
  setFakeTable("forge_relay_nonces", []);
  setFakeTable("forge_relay_audit", []);
});

describe("POST /api/relay/webhook-secret", () => {
  it("registers an https endpoint and stores the secret encrypted", async () => {
    const response = await route(
      signedRequest(JSON.stringify({ webhookUrl: "https://on-prem.example.com/api/webhooks/github", secret: SECRET })) as never,
    );
    expect(response.status).toBe(200);
    const instance = fakeTables["forge_relay_instances"]?.[0] as Record<string, unknown>;
    expect(instance.webhook_url).toBe("https://on-prem.example.com/api/webhooks/github");
    expect(instance.webhook_secret_encrypted).toBeTruthy();
    expect(String(instance.webhook_secret_encrypted)).not.toContain(SECRET);
    expect(fakeTables["forge_relay_audit"]?.[0]).toMatchObject({
      action: "webhook_secret_registered",
    });
  });

  it("persists the normalized URL that passed public-address validation", async () => {
    const response = await route(
      signedRequest(
        JSON.stringify({
          webhookUrl: "https://ON-PREM.example.com:443/api/webhooks/github#ignored",
          secret: SECRET,
        }),
      ) as never,
    );

    expect(response.status).toBe(200);
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({
      webhook_url: "https://on-prem.example.com/api/webhooks/github",
    });
  });

  it.each([
    "http://on-prem.example.com/api/webhooks/github",
    "http://localhost:3000/api/webhooks/github",
  ])("refuses a cleartext target: %s", async (webhookUrl) => {
    const response = await route(
      signedRequest(JSON.stringify({ webhookUrl, secret: SECRET })) as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("HTTPS"),
    });
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({ webhook_url: null });
  });

  it.each([
    "https://127.0.0.1/api/webhooks/github",
    "https://10.0.0.5/api/webhooks/github",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/api/webhooks/github",
    "https://0x7f000001/api/webhooks/github",
    "https://user:secret@on-prem.example.com/api/webhooks/github",
  ])("refuses a private or provider-internal address: %s", async (webhookUrl) => {
    const response = await route(
      signedRequest(JSON.stringify({ webhookUrl, secret: SECRET })) as never,
    );
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({ webhook_url: null });
  });

  it("refuses a hostname when any DNS answer is private", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34" },
      { address: "169.254.169.254" },
    ]);
    const response = await route(
      signedRequest(
        JSON.stringify({
          webhookUrl: "https://metadata.google.internal/api/webhooks/github",
          secret: SECRET,
        }),
      ) as never,
    );
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({ webhook_url: null });
  });

  it("answers 400 on a malformed body instead of throwing", async () => {
    const response = await route(signedRequest("{not json") as never);
    expect(response.status).toBe(400);
  });

  it("rejects an unsigned request", async () => {
    const response = await route(
      new Request("http://localhost/api/relay/webhook-secret", {
        method: "POST",
        body: "{}",
      }) as never,
    );
    expect(response.status).toBe(401);
  });
});
