import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeQuery, fakeTables, setFakeInsertError, setFakeTable } from "../../../test/forge-relay/fake-supabase";

/**
 * `POST /api/relay/register` — self-service instance registration, Cloud
 * side. Open by design (no minddy account), bounded by guardrails: Ed25519
 * public keys only, per-IP rate limit, one identity per public key
 * (idempotent retries), and an audit entry per registration.
 */

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

const { generateKeyPairSync } = await import("node:crypto");
const { POST } = await import("@/app/api/relay/register/route");

let managedForge = true;
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => managedForge,
}));

function publicKeyPem(): string {
  const { publicKey } = generateKeyPairSync("ed25519");
  return publicKey.export({ format: "pem", type: "spki" }).toString();
}

function request(body: unknown, ip = "203.0.113.9"): Parameters<typeof POST>[0] {
  return {
    headers: new Headers({ "x-forwarded-for": ip }),
    json: async () => body,
  } as never;
}

beforeEach(() => {
  managedForge = true;
  setFakeTable("forge_relay_instances", []);
  setFakeTable("forge_relay_audit", []);
});

describe("POST /api/relay/register", () => {
  it("registers a new instance from a valid Ed25519 public key", async () => {
    const response = await POST(request({ publicKey: publicKeyPem(), name: "on-prem" }));
    expect(response.status).toBe(200);
    const { instanceId } = (await response.json()) as { instanceId: string };
    expect(instanceId).toBeTruthy();
    expect(fakeTables["forge_relay_instances"]).toHaveLength(1);
    // `status` is applied by the schema default; the fake stores what the
    // route wrote.
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({
      name: "on-prem",
    });
    expect(fakeTables["forge_relay_audit"]?.[0]).toMatchObject({
      action: "instance_registered",
    });
  });

  it("refuses everything when the managed forge is off, or the key is not Ed25519", async () => {
    managedForge = false;
    expect((await POST(request({ publicKey: publicKeyPem() }))).status).toBe(503);
    managedForge = true;

    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ publicKey: "not-a-key" }))).status).toBe(400);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rsaPem = rsa.publicKey.export({ format: "pem", type: "spki" }).toString();
    expect((await POST(request({ publicKey: rsaPem }))).status).toBe(400);
    expect(fakeTables["forge_relay_instances"]).toHaveLength(0);
  });

  it("returns the EXISTING instance id when the public key is already registered", async () => {
    const first = await POST(request({ publicKey: publicKeyPem() }, "203.0.113.10"));
    const { instanceId } = (await first.json()) as { instanceId: string };
    // Emulate the schema default the fake does not apply.
    fakeTables["forge_relay_instances"]![0]!.status = "active";
    const storedKey = String(fakeTables["forge_relay_instances"]?.[0]?.public_key);

    // The unique index on public_key rejects the re-registration (the fake
    // surfaces it as a generic insert error); the route then resolves the
    // EXISTING identity instead of failing.
    setFakeInsertError({ code: "23505", message: "duplicate key" });
    try {
      const retry = await POST(
        request({ publicKey: storedKey }, "198.51.100.7"),
      );
      expect(retry.status).toBe(200);
      await expect(retry.json()).resolves.toEqual({ instanceId });
    } finally {
      setFakeInsertError(null);
    }
    expect(fakeTables["forge_relay_instances"]).toHaveLength(1);
  });

  it("rate limits registrations per IP", async () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 10; i += 1) {
      const response = await POST(request({ publicKey: publicKeyPem() }, ip));
      expect(response.status).toBe(200);
    }
    const eleventh = await POST(request({ publicKey: publicKeyPem() }, ip));
    expect(eleventh.status).toBe(429);
    // Another IP is unaffected.
    expect((await POST(request({ publicKey: publicKeyPem() }, "192.0.2.78"))).status).toBe(200);
  });
});
