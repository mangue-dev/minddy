import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
  type FakeRow,
} from "../../../test/forge-relay/fake-supabase";

/**
 * GitHub user-authorization broker (docs/managed-forge-relay-plan.md,
 * "User authorization (human gestures)").
 *
 * Pinned properties: the instance-signed state is unfalsifiable without the
 * instance's private key and short-lived; the brokered token set is stored
 * ENCRYPTED, handed out only to its instance over the signed channel, single
 * consumption with idempotent re-reads; user tokens end their journey on the
 * instance — Cloud only ever parks them transiently.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

function generateInstanceKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

const { publicKeyPem, privateKeyPem } = generateInstanceKeys();

function seedInstance(status = "active"): void {
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: publicKeyPem,
      status,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  ]);
  setFakeTable("forge_relay_user_deliveries", []);
}

const DELIVERY = {
  userId: "user-on-instance",
  account: { id: 777, login: "octo", avatarUrl: "https://avatars/777" },
  tokens: {
    accessToken: "user-access-token",
    expiresAt: "2026-08-21T20:00:00Z",
    refreshToken: "user-refresh-token",
    scope: "",
  },
};

const {
  signRelayUserState,
  verifyRelayUserState,
  signCloudUserState,
  verifyCloudUserState,
  createUserDelivery,
  consumeUserDelivery,
} = await import("./user-broker");

beforeEach(() => {
  seedInstance();
});

describe("instance-signed authorization state", () => {
  it("round-trips against the registered public key", async () => {
    const token = signRelayUserState({
      userId: "user-on-instance",
      origin: "settings",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    await expect(
      verifyRelayUserState(INSTANCE_ID, token),
    ).resolves.toMatchObject({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      origin: "settings",
      callbackOrigin: "https://on-prem.example.com",
    });
  });

  it("rejects a tampered state, a foreign key, an expired state, and a revoked instance", async () => {
    const token = signRelayUserState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    const [body, signature] = token.split(".");
    await expect(
      verifyRelayUserState(INSTANCE_ID, `${body.slice(0, -2)}xx.${signature}`),
    ).resolves.toBeNull();

    const { privateKeyPem: otherKey } = generateInstanceKeys();
    const forged = signRelayUserState({
      userId: "victim",
      callbackOrigin: "https://evil.example.com",
      privateKey: otherKey,
    });
    await expect(verifyRelayUserState(INSTANCE_ID, forged)).resolves.toBeNull();

    const stale = signRelayUserState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
      now: Date.now() - 30 * 60_000,
    });
    await expect(verifyRelayUserState(INSTANCE_ID, stale)).resolves.toBeNull();

    seedInstance("revoked");
    const fresh = signRelayUserState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    await expect(verifyRelayUserState(INSTANCE_ID, fresh)).resolves.toBeNull();
  });
});

describe("cloud-signed state", () => {
  it("round-trips and rejects tampering", () => {
    const token = signCloudUserState({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
    });
    expect(verifyCloudUserState(token)).toMatchObject({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
    });
    const [body, signature] = token.split(".");
    expect(verifyCloudUserState(`${`${"x".repeat(body.length)}`}.${signature}`)).toBeNull();
    expect(verifyCloudUserState(null)).toBeNull();
  });
});

describe("user deliveries", () => {
  it("parks the token set encrypted and hands it to its instance once", async () => {
    const deliveryId = await createUserDelivery({
      instanceId: INSTANCE_ID,
      delivery: DELIVERY,
    });
    expect(deliveryId).toMatch(/^[0-9a-f-]{36}$/);

    // At rest, the access token never appears in plaintext.
    const row = fakeTables["forge_relay_user_deliveries"]?.[0] as Record<string, unknown>;
    expect(String(row.access_token_encrypted)).not.toContain("user-access-token");

    const first = await consumeUserDelivery({ instanceId: INSTANCE_ID, deliveryId });
    expect(first).toEqual({ status: "delivered", delivery: DELIVERY });
    expect(
      (fakeTables["forge_relay_user_deliveries"] as FakeRow[])[0].status,
    ).toBe("delivered");

    // Retry-friendly: same answer to the same instance.
    await expect(consumeUserDelivery({ instanceId: INSTANCE_ID, deliveryId })).resolves.toEqual(first);
  });

  it("reports pending for an unknown delivery and never leaks across instances", async () => {
    await expect(
      consumeUserDelivery({
        instanceId: INSTANCE_ID,
        deliveryId: "00000000-0000-4000-8000-00000000dead",
      }),
    ).resolves.toEqual({ status: "pending" });

    const deliveryId = await createUserDelivery({
      instanceId: INSTANCE_ID,
      delivery: DELIVERY,
    });
    await expect(
      consumeUserDelivery({
        instanceId: "11111111-1111-4111-8111-111111111111",
        deliveryId,
      }),
    ).resolves.toEqual({ status: "pending" });
  });
});
