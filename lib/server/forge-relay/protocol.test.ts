import { describe, expect, it, beforeEach, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  setFakeTable,
  setFakeInsertError,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Ed25519 request authentication for the forge relay control plane
 * (docs/managed-forge-relay-plan.md, "Instance identity and authentication").
 *
 * The properties pinned here are the ones an attacker would probe: signature
 * coverage of the exact raw body, the timestamp window, single-use nonces
 * (replay), and the revocation kill switch. All crypto is REAL — only the
 * database is faked.
 */

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

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

function seedInstance(publicKeyPem: string, status = "active"): void {
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
  setFakeTable("forge_relay_nonces", []);
}

const { signRelayRequest, verifyRelayRequest, normalizeRelayPublicKey } = await import(
  "./protocol"
);

beforeEach(() => {
  setFakeInsertError(null);
});

describe("verifyRelayRequest", () => {
  it("accepts a properly signed request from an active instance", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem);

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      rawBody: '{"events":[]}',
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    await expect(
      verifyRelayRequest({
        method: "POST",
        path: "/api/relay/links",
        headers: new Headers(signature),
        rawBody: '{"events":[]}',
      }),
    ).resolves.toMatchObject({ ok: true, instance: { id: INSTANCE_ID, name: "on-prem" } });
  });

  it("rejects a tampered body — the signature covers the exact raw bytes", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem);

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/github/installation-token",
      rawBody: '{"installationId":1,"repositories":["app"]}',
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    const result = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/github/installation-token",
      headers: new Headers(signature),
      rawBody: '{"installationId":1,"repositories":["victim"]}',
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a signature made for another path or method", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem);

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      rawBody: "{}",
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    const result = await verifyRelayRequest({
      method: "GET",
      path: "/api/relay/links",
      headers: new Headers(signature),
      rawBody: "{}",
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects timestamps outside the tolerance window", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem);

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      rawBody: "{}",
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
      now: Date.now() - 30 * 60_000,
    });
    const result = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(signature),
      rawBody: "{}",
    });
    expect(result).toMatchObject({ ok: false, status: 401, error: expect.stringContaining("timestamp") });
  });

  it("rejects a replayed nonce even with a valid signature", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem);

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      rawBody: "{}",
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
      nonce: "one-time-nonce",
    });
    const headers = new Headers(signature);
    const first = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers,
      rawBody: "{}",
    });
    expect(first).toMatchObject({ ok: true });
    const replay = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers,
      rawBody: "{}",
    });
    expect(replay).toMatchObject({ ok: false, status: 401, error: expect.stringContaining("Replayed") });
  });

  it("rejects a revoked instance — revocation is immediate", async () => {
    const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
    seedInstance(publicKeyPem, "revoked");

    const signature = signRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      rawBody: "{}",
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    const result = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(signature),
      rawBody: "{}",
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: expect.stringContaining("revoked") });
  });

  it("rejects an unknown instance and a request with missing headers", async () => {
    seedInstance("unused");
    const { privateKeyPem } = generateInstanceKeys();

    const unknown = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(
        signRelayRequest({
          method: "POST",
          path: "/api/relay/links",
          rawBody: "{}",
          instanceId: "00000000-0000-4000-8000-000000000000",
          privateKey: privateKeyPem,
        }),
      ),
      rawBody: "{}",
    });
    expect(unknown).toMatchObject({ ok: false, status: 401, error: expect.stringContaining("Unknown") });

    const missing = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(),
      rawBody: "{}",
    });
    expect(missing).toMatchObject({ ok: false, status: 401 });
  });
});

describe("normalizeRelayPublicKey", () => {
  it("canonicalizes PEM and base64 DER public keys to PEM", () => {
    const { publicKeyPem } = generateInstanceKeys();
    expect(normalizeRelayPublicKey(publicKeyPem)).toBe(publicKeyPem);

    const der = crypto.createPublicKey(publicKeyPem).export({ format: "der", type: "spki" });
    expect(normalizeRelayPublicKey(der.toString("base64"))).toBe(publicKeyPem);
  });

  it("refuses keys that are not Ed25519", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(() => normalizeRelayPublicKey(rsaPem)).toThrow(/Ed25519/);
    expect(() => normalizeRelayPublicKey("not-a-key")).toThrow();
  });
});
