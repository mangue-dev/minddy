import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeQuery, fakeTables, setFakeTable } from "../../../test/forge-relay/fake-supabase";

/**
 * Self-service provisioning of the managed forge relay, instance side
 * (docs/managed-forge-relay-plan.md). Pinned properties: the relay is a
 * DEFAULT self-hosted capability (no variable to set), registration happens
 * lazily on first connect and exactly once, the issued identity is stored
 * encrypted in the instance database, and both the explicit opt-out
 * (MINDDY_FORGE_RELAY=0) and the cloud edition refuse to provision.
 */

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

const INSTANCE_ID = "7f6e5d4c-3b2a-4948-8272-6d6f64656c79";

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

let fetchCalls: { url: string; init: RequestInit }[] = [];

function stubRegistrationFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ instanceId: INSTANCE_ID }), {
        status: 200,
      });
    }),
  );
}

const provisioning = await import("./provisioning");
const { encryptForgeToken } = await import("@/lib/server/git/token-crypto");

function seedExistingIdentity(): void {
  setFakeTable("forge_relay_provisioning", [
    {
      id: true,
      relay_url: "https://pinned.example.com",
      instance_id: INSTANCE_ID,
      signing_key_encrypted: encryptForgeToken(
        "-----BEGIN PRIVATE KEY-----\nstored\n-----END PRIVATE KEY-----\n",
      ),
      webhook_secret_encrypted: encryptForgeToken("stored-webhook-secret-32-chars-x"),
    },
  ]);
}

beforeEach(() => {
  fetchCalls = [];
  setFakeTable("forge_relay_provisioning", []);
  delete process.env.MINDDY_FORGE_RELAY;
  delete process.env.MINDDY_FORGE_RELAY_URL;
  delete process.env.MINDDY_FORGE_RELAY_INSTANCE_ID;
  delete process.env.MINDDY_FORGE_RELAY_SECRET;
  delete process.env.MINDDY_EDITION;
  provisioning.__resetProvisioningCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureForgeRelayProvisioned", () => {
  it("registers once against the default control plane and stores the identity", async () => {
    stubRegistrationFetch();
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(true);

    // One registration call + one webhook-endpoint push.
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toBe("https://minddy.app/api/relay/register");
    const body = JSON.parse(String(fetchCalls[0].init.body));
    expect(body.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(fetchCalls[1].url).toBe(
      "https://minddy.app/api/relay/webhook-secret",
    );

    // The identity landed in the instance database, encrypted at rest.
    const rows = fakeTables["forge_relay_provisioning"] ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relay_url: "https://minddy.app",
      instance_id: INSTANCE_ID,
    });
    expect(String(rows[0].signing_key_encrypted)).not.toContain("PRIVATE KEY");

    // Second call: served by the cache, no new round trip.
    fetchCalls = [];
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(true);
    expect(fetchCalls).toHaveLength(0);
    expect(provisioning.getProvisionedRelayConfig()).toMatchObject({
      url: "https://minddy.app",
      instanceId: INSTANCE_ID,
    });
    expect(provisioning.getProvisionedWebhookSecret()).toBeTruthy();
  });

  it("loads an existing identity without registering", async () => {
    seedExistingIdentity();
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(true);
    expect(fetchCalls).toHaveLength(0);
    expect(provisioning.getProvisionedRelayConfig()).toMatchObject({
      url: "https://pinned.example.com",
      instanceId: INSTANCE_ID,
    });
  });

  it("refuses the explicit opt-out and the cloud edition", async () => {
    process.env.MINDDY_FORGE_RELAY = "0";
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(false);
    expect(provisioning.getProvisionedRelayConfig()).toBeNull();

    delete process.env.MINDDY_FORGE_RELAY;
    process.env.MINDDY_EDITION = "cloud";
    provisioning.__resetProvisioningCacheForTests();
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(false);
  });

  it("defers to explicit environment variables without touching the database", async () => {
    process.env.MINDDY_FORGE_RELAY_URL = "https://env.example.com";
    process.env.MINDDY_FORGE_RELAY_INSTANCE_ID = "env-instance";
    process.env.MINDDY_FORGE_RELAY_SECRET = "env-secret";
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(true);
    expect(fetchCalls).toHaveLength(0);
    expect(provisioning.getProvisionedRelayConfig()).toBeNull();
  });

  it("keeps the webhook receiver able to load the stored secret without registering", async () => {
    seedExistingIdentity();
    expect(await provisioning.loadProvisionedRelayConfig()).toBe(true);
    expect(provisioning.getProvisionedWebhookSecret()).toBe(
      "stored-webhook-secret-32-chars-x",
    );
  });

  it("re-queries the database instead of caching an absent row negatively", async () => {
    // Multi-process deployments: another process may provision at any time,
    // so an absent row must be looked up again on every read.
    expect(await provisioning.loadProvisionedRelayConfig()).toBe(false);
    seedExistingIdentity();
    expect(await provisioning.loadProvisionedRelayConfig()).toBe(true);
    expect(provisioning.getProvisionedRelayConfig()).toMatchObject({
      instanceId: INSTANCE_ID,
    });
  });

  it("refuses to register when the instance-side secrets are missing", async () => {
    // The guard runs BEFORE the control-plane call: a registration that
    // cannot be stored locally must not create a live identity on Cloud.
    vi.stubEnv("GIT_STATE_SECRET", "");
    vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "too-short");
    stubRegistrationFetch();
    try {
      expect(await provisioning.ensureForgeRelayProvisioned()).toBe(false);
      expect(fetchCalls).toHaveLength(0);
      expect(fakeTables["forge_relay_provisioning"] ?? []).toHaveLength(0);
      expect(provisioning.getProvisionedRelayConfig()).toBeNull();
    } finally {
      vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
      vi.stubEnv(
        "GIT_TOKEN_ENCRYPTION_SECRET",
        "token-crypto-secret-0123456789abcdef",
      );
    }
    // Recovering the secrets is enough — no Cloud-side cleanup to undo.
    expect(await provisioning.ensureForgeRelayProvisioned()).toBe(true);
    expect(fetchCalls).toHaveLength(2);
  });
});
