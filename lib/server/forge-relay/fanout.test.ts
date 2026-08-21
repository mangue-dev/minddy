import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeInsertError,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Webhook fan-out engine (docs/managed-forge-relay-plan.md, "Webhook relay").
 *
 * Pinned properties: the GUID is PRESERVED (instance dedup keeps working), the
 * payload is re-signed with the instance-generated secret in GitHub's header
 * format plus the relay marker, delivery is at-least-once with backoff and
 * dead-letter after exhaustion — INCLUDING an endpoint that never registers,
 * which follows the same attempt ladder instead of retrying forever.
 */

vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => true,
}));

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const WEBHOOK_SECRET = "instance-generated-webhook-secret-32ch";
const ENDPOINT = "https://on-prem.example.com/api/webhooks/github";

function seedWorld(overrides: Record<string, unknown> = {}): void {
  setFakeTable("forge_relay_installations", [
    {
      id: "claim-1",
      instance_id: INSTANCE_ID,
      installation_id: 4242,
      account_login: "acme",
      claimed_at: new Date().toISOString(),
    },
  ]);
  setFakeTable("forge_relay_deliveries", (overrides.deliveries as Record<string, unknown>[]) ?? []);
}

const { encryptForgeToken } = await import("@/lib/server/git/token-crypto");
const { enqueueRelayDeliveryForPayload, processDueRelayDeliveries } = await import(
  "./fanout"
);

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchStatus = 200;

beforeEach(() => {
  fetchCalls = [];
  fetchStatus = 200;
  seedWorld();
  vi.stubGlobal(
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: fetchStatus });
    },
  );
});

describe("enqueueRelayDeliveryForPayload", () => {
  it("enqueues one verbatim delivery for the claiming instance", async () => {
    const rawBody = JSON.stringify({ action: "opened", installation: { id: 4242 } });
    const instanceId = await enqueueRelayDeliveryForPayload({
      provider: "github",
      event: "pull_request",
      deliveryGuid: "guid-1",
      rawBody,
    });
    expect(instanceId).toBe(INSTANCE_ID);
    expect(fakeTables["forge_relay_deliveries"]).toHaveLength(1);
    expect(fakeTables["forge_relay_deliveries"]?.[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      delivery_guid: "guid-1",
      payload: rawBody,
      // status defaults to 'pending' in the schema.
    });
  });

  it("ignores unclaimed installations and malformed payloads", async () => {
    const unclaimed = await enqueueRelayDeliveryForPayload({
      provider: "github",
      event: "pull_request",
      deliveryGuid: "guid-2",
      rawBody: JSON.stringify({ installation: { id: 9999 } }),
    });
    const malformed = await enqueueRelayDeliveryForPayload({
      provider: "github",
      event: "pull_request",
      deliveryGuid: "guid-3",
      rawBody: "not json",
    });
    expect(unclaimed).toBeNull();
    expect(malformed).toBeNull();
    expect(fakeTables["forge_relay_deliveries"] ?? []).toHaveLength(0);
  });

  it("absorbs a duplicate enqueue of the same delivery", async () => {
    const rawBody = JSON.stringify({ installation: { id: 4242 } });
    for (let i = 0; i < 2; i += 1) {
      await enqueueRelayDeliveryForPayload({
        provider: "github",
        event: "issues",
        deliveryGuid: "guid-dup",
        rawBody,
      });
    }
    expect(fakeTables["forge_relay_deliveries"]).toHaveLength(1);
  });

  it("THROWS when the enqueue write fails — the caller must answer 5xx", async () => {
    // A swallowed error would let the receiver answer 200 after the dedup
    // window: the forge would never re-deliver and the event would be lost.
    setFakeInsertError({ code: "08006", message: "connection failure" });
    try {
      await expect(
        enqueueRelayDeliveryForPayload({
          provider: "github",
          event: "issues",
          deliveryGuid: "guid-fail",
          rawBody: JSON.stringify({ installation: { id: 4242 } }),
        }),
      ).rejects.toThrow(/relay delivery enqueue failed/);
    } finally {
      setFakeInsertError(null);
    }
    expect(fakeTables["forge_relay_deliveries"] ?? []).toHaveLength(0);
  });
});

describe("processDueRelayDeliveries", () => {
  function dueDelivery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: crypto.randomUUID(),
      instance_id: INSTANCE_ID,
      delivery_guid: `guid-${Math.random().toString(36).slice(2)}`,
      event: "issue_comment",
      payload: JSON.stringify({ action: "created", installation: { id: 4242 } }),
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      forge_relay_instances: {
        webhook_url: ENDPOINT,
        webhook_secret_encrypted: encryptForgeToken(WEBHOOK_SECRET),
      },
      ...overrides,
    };
  }

  it("delivers with the preserved GUID, a valid HMAC signature, and the relay marker", async () => {
    const delivery = dueDelivery();
    seedWorld({ deliveries: [delivery] });

    const outcome = await processDueRelayDeliveries();
    expect(outcome).toEqual({ processed: 1, delivered: 1, dead: 0 });
    expect(fetchCalls).toHaveLength(1);
    const { url, init } = fetchCalls[0];
    expect(url).toBe(ENDPOINT);
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("x-github-delivery")).toBe(delivery.delivery_guid);
    expect(headers.get("x-github-event")).toBe("issue_comment");
    expect(headers.get("x-minddy-relay")).toBe("1");

    // The signature must verify against the INSTANCE-generated secret.
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", WEBHOOK_SECRET).update(String(init.body)).digest("hex");
    expect(headers.get("x-hub-signature-256")).toBe(expected);

    expect((fakeTables["forge_relay_deliveries"] as unknown[])[0]).toMatchObject({
      status: "delivered",
    });
  });

  it("backs off on failure and dead-letters after exhaustion", async () => {
    fetchStatus = 500;
    const midWay = dueDelivery({ attempts: 3 });
    const exhausted = dueDelivery({ attempts: 4 });
    seedWorld({ deliveries: [midWay, exhausted] });

    const outcome = await processDueRelayDeliveries();
    expect(outcome).toEqual({ processed: 2, delivered: 0, dead: 1 });

    const rows = fakeTables["forge_relay_deliveries"] as Record<string, unknown>[];
    expect(rows.find((r) => r.id === midWay.id)).toMatchObject({
      status: "pending",
      attempts: 4,
    });
    expect(Number(new Date(rows.find((r) => r.id === midWay.id)?.next_attempt_at as string)) - Date.now())
      .toBeGreaterThan(10 * 60_000);
    expect(rows.find((r) => r.id === exhausted.id)).toMatchObject({
      status: "dead",
      attempts: 5,
    });
  });

  it("backs off an unregistered endpoint on the attempt ladder and dead-letters it", async () => {
    // A delivery for an endpoint that never registers must not retry every
    // minute forever: same ladder, same exhaustion as a delivery failure.
    const fresh = dueDelivery({
      forge_relay_instances: { webhook_url: null, webhook_secret_encrypted: null },
    });
    const exhausted = dueDelivery({
      attempts: 4,
      forge_relay_instances: { webhook_url: null, webhook_secret_encrypted: null },
    });
    seedWorld({ deliveries: [fresh, exhausted] });

    const outcome = await processDueRelayDeliveries();
    expect(outcome).toEqual({ processed: 2, delivered: 0, dead: 1 });
    expect(fetchCalls).toHaveLength(0);

    const rows = fakeTables["forge_relay_deliveries"] as Record<string, unknown>[];
    const freshRow = rows.find((r) => r.id === fresh.id);
    expect(freshRow).toMatchObject({
      status: "pending",
      attempts: 1,
      last_error: "instance webhook endpoint not registered",
    });
    expect(
      Number(new Date(freshRow?.next_attempt_at as string)) - Date.now(),
    ).toBeGreaterThan(30_000);
    expect(rows.find((r) => r.id === exhausted.id)).toMatchObject({
      status: "dead",
      attempts: 5,
    });
  });

  it("counts a delivery once when a concurrent worker already delivered the row", async () => {
    const delivery = dueDelivery();
    seedWorld({ deliveries: [delivery] });

    // A second worker delivers the row WHILE our POST runs: our compare-and-set
    // on (status=pending) then matches nothing, so we must not double-count.
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      const rows = fakeTables["forge_relay_deliveries"] as Record<string, unknown>[];
      const row = rows.find((r) => r.id === delivery.id);
      if (row) {
        row.status = "delivered";
        row.delivered_at = new Date().toISOString();
      }
      return new Response("{}", { status: 200 });
    });

    const outcome = await processDueRelayDeliveries();
    expect(outcome).toEqual({ processed: 1, delivered: 0, dead: 0 });
  });
});
