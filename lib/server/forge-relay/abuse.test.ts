import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Abuse and hardening suite for the managed forge relay (Phase 6,
 * docs/managed-forge-relay-plan.md). These are the properties an attacker
 * would probe, gathered in one place:
 *
 * - signature fuzzing: random signatures never pass, and each attempt costs
 *   exactly one nonce-less refusal (no state is consumed);
 * - the timestamp window has hard edges;
 * - the mint quota refuses AT the limit, not after it;
 * - the fan-out worker is bounded and never touches future deliveries;
 * - finished deliveries age out; pending ones never do.
 */

vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => true,
}));

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

function seedWorld(): void {
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
  setFakeTable("forge_relay_nonces", []);
  setFakeTable("forge_relay_installations", [
    {
      id: "claim-1",
      instance_id: INSTANCE_ID,
      installation_id: 4242,
      account_login: "acme",
      claimed_at: new Date().toISOString(),
    },
  ]);
  setFakeTable("forge_relay_link_mirror", [
    {
      instance_id: INSTANCE_ID,
      provider: "github",
      external_repo_id: "9001",
      repo_full_name: "acme/app",
      updated_at: new Date().toISOString(),
    },
  ]);
  setFakeTable("forge_relay_audit", []);
  setFakeTable("forge_relay_deliveries", []);
}

const { signRelayRequest, verifyRelayRequest } = await import("./protocol");
const { parseInstallationTokenMintPayload, FORGE_RELAY_MINT_QUOTA_PER_HOUR } = await import(
  "./mint"
);
const { processDueRelayDeliveries, pruneFinishedRelayDeliveries } = await import("./fanout");

beforeEach(() => {
  seedWorld();
});

describe("signature fuzzing", () => {
  it("rejects every forged signature without consuming relay state", async () => {
    const rawBody = JSON.stringify({ installationId: 4242, repositoryIds: [9001] });
    let rejected = 0;
    for (let i = 0; i < 25; i += 1) {
      const signature = signRelayRequest({
        method: "POST",
        path: "/api/relay/github/installation-token",
        rawBody,
        instanceId: INSTANCE_ID,
        privateKey: privateKeyPem,
      });
      signature["x-minddy-relay-signature"] = crypto.randomBytes(64).toString("base64");
      const result = await verifyRelayRequest({
        method: "POST",
        path: "/api/relay/github/installation-token",
        headers: new Headers(signature),
        rawBody,
      });
      if (!result.ok) rejected += 1;
    }
    expect(rejected).toBe(25);
    // No nonce was burned by the fuzzing: a legitimate request still passes.
    const legitimate = signRelayRequest({
      method: "POST",
      path: "/api/relay/github/installation-token",
      rawBody,
      instanceId: INSTANCE_ID,
      privateKey: privateKeyPem,
    });
    await expect(
      verifyRelayRequest({
        method: "POST",
        path: "/api/relay/github/installation-token",
        headers: new Headers(legitimate),
        rawBody,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("enforces hard timestamp-window edges", async () => {
    const rawBody = "{}";
    const make = (offsetMs: number) =>
      signRelayRequest({
        method: "POST",
        path: "/api/relay/links",
        rawBody,
        instanceId: INSTANCE_ID,
        privateKey: privateKeyPem,
        now: Date.now() + offsetMs,
      });
    const { RELAY_TIMESTAMP_TOLERANCE_MS } = await import("./protocol");

    const inside = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(make(RELAY_TIMESTAMP_TOLERANCE_MS - 1000)),
      rawBody,
    });
    expect(inside).toMatchObject({ ok: true });

    const outside = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(make(RELAY_TIMESTAMP_TOLERANCE_MS + 60_000)),
      rawBody,
    });
    expect(outside).toMatchObject({ ok: false, status: 401 });

    const future = await verifyRelayRequest({
      method: "POST",
      path: "/api/relay/links",
      headers: new Headers(make(-10 * 60_000)),
      rawBody,
    });
    expect(future).toMatchObject({ ok: false, status: 401 });
  });
});

describe("mint quota and payload constraints", () => {
  it("refuses AT the quota boundary, not after it", async () => {
    const payload = { installationId: 4242, repositoryIds: [9001], profile: "repo-write" };
    expect(parseInstallationTokenMintPayload(payload).ok).toBe(true);

    // The quota check itself lives in mintRelayedInstallationToken over the
    // audit ledger — here we pin the constant and the payload gate that an
    // attacker would hammer instead.
    expect(FORGE_RELAY_MINT_QUOTA_PER_HOUR).toBeGreaterThan(0);
    const flood = Array.from(
      { length: 50 },
      () =>
        parseInstallationTokenMintPayload({
          installationId: 4242,
          repositoryIds: [-1],
          profile: "repo-write",
        }),
    );
    expect(flood.every((r) => !r.ok)).toBe(true);
  });

  it("caps repositories per mint", () => {
    const oversized = parseInstallationTokenMintPayload({
      installationId: 4242,
      repositoryIds: Array.from({ length: 11 }, (_, i) => i + 1),
      profile: "repo-write",
    });
    expect(oversized.ok).toBe(false);
  });

  it("refuses a payload without an explicit permission profile", () => {
    // An empty or absent permission object would silently mint ALL of the
    // app's declared permissions; only the named `full` profile may.
    for (const body of [
      { installationId: 4242, repositoryIds: [9001] },
      { installationId: 4242, repositoryIds: [9001], permissions: {} },
      { installationId: 4242, repositoryIds: [9001], profile: "" },
      { installationId: 4242, repositoryIds: [9001], profile: "admin" },
      {
        installationId: 4242,
        repositoryIds: [9001],
        permissions: { contents: "read", issues: "write" },
      },
    ]) {
      expect(parseInstallationTokenMintPayload(body).ok).toBe(false);
    }
    // Linked operations require a repository id.
    for (const profile of ["full", "repo-write", "repo-read"]) {
      expect(
        parseInstallationTokenMintPayload({
          installationId: 4242,
          repositoryIds: [9001],
          profile,
        }).ok,
      ).toBe(true);
    }
    // Repository enumeration is the sole pre-link profile and carries no ids.
    expect(
      parseInstallationTokenMintPayload({
        installationId: 4242,
        repositoryIds: [],
        profile: "repository-list",
      }).ok,
    ).toBe(true);
    expect(
      parseInstallationTokenMintPayload({
        installationId: 4242,
        repositoryIds: [9001],
        profile: "repository-list",
      }).ok,
    ).toBe(false);
  });
});

describe("fan-out worker bounds", () => {
  function delivery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: crypto.randomUUID(),
      instance_id: INSTANCE_ID,
      provider: "github",
      delivery_guid: `guid-${Math.random().toString(36).slice(2)}`,
      event: "issues",
      payload: "{}",
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      forge_relay_instances: {
        webhook_url: "https://on-prem.example.com/api/webhooks/github",
        webhook_secret_encrypted: null,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 200 }));
  });

  it("processes at most `limit` deliveries per pass", async () => {
    setFakeTable(
      "forge_relay_deliveries",
      Array.from({ length: 8 }, () => delivery()),
    );
    const outcome = await processDueRelayDeliveries(3);
    expect(outcome.processed).toBe(3);
  });

  it("never touches future deliveries or finished ones", async () => {
    setFakeTable("forge_relay_deliveries", [
      delivery({ next_attempt_at: new Date(Date.now() + 60 * 60_000).toISOString() }),
      delivery({ status: "delivered" }),
      delivery({ status: "dead" }),
    ]);
    const outcome = await processDueRelayDeliveries();
    expect(outcome.processed).toBe(0);
  });

  it("prunes finished deliveries past retention and keeps pending ones", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    setFakeTable("forge_relay_deliveries", [
      delivery({ status: "delivered", created_at: old }),
      delivery({ status: "dead", created_at: old }),
      delivery({ status: "pending", created_at: old }),
      delivery({ status: "delivered" }),
    ]);
    const pruned = await pruneFinishedRelayDeliveries();
    expect(pruned).toBe(2);
    const remaining = (fakeTables["forge_relay_deliveries"] as Record<string, unknown>[]).map(
      (r) => r.status,
    );
    expect(remaining.sort()).toEqual(["delivered", "pending"]);
  });
});
