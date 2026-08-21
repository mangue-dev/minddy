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
 * https (http only tolerated for loopback hosts — Cloud POSTs payloads and
 * signature headers to it, so cleartext internet hosts are refused), and a
 * malformed body from an authenticated instance is a 400, not a 500.
 */

vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

let forgeEnabled = true;
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

  it("refuses a cleartext internet host (Cloud POSTs signatures to it)", async () => {
    const response = await route(
      signedRequest(JSON.stringify({ webhookUrl: "http://on-prem.example.com/api/webhooks/github", secret: SECRET })) as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("https"),
    });
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({ webhook_url: null });
  });

  it("tolerates http for loopback hosts only", async () => {
    const loopback = await route(
      signedRequest(JSON.stringify({ webhookUrl: "http://localhost:3000/api/webhooks/github", secret: SECRET })) as never,
    );
    expect(loopback.status).toBe(200);

    const notLoopback = await route(
      signedRequest(JSON.stringify({ webhookUrl: "http://localhost.example.com.evil.test/api/webhooks/github", secret: SECRET })) as never,
    );
    expect(notLoopback.status).toBe(400);
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
