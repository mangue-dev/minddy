import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const CODE = "d".repeat(64);
const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => true,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

const { signRelayRequest } = await import("@/lib/server/forge-relay/protocol");
const { POST: startClaim } = await import(
  "@/app/api/relay/github/claim-start/route"
);

function request(code = CODE): Request {
  const rawBody = JSON.stringify({ code });
  const signature = signRelayRequest({
    method: "POST",
    path: "/api/relay/github/claim-start",
    rawBody,
    instanceId: INSTANCE_ID,
    privateKey: privateKeyPem,
  });
  return new Request("http://localhost/api/relay/github/claim-start", {
    method: "POST",
    headers: signature,
    body: rawBody,
  });
}

beforeEach(() => {
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: publicKeyPem,
      status: "active",
    },
  ]);
  setFakeTable("forge_relay_nonces", []);
  setFakeTable("forge_relay_claims", []);
});

describe("POST /api/relay/github/claim-start", () => {
  it("registers a pending claim for the authenticated instance", async () => {
    const response = await startClaim(request() as never);
    expect(response.status).toBe(200);
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      status: "pending",
      installation_id: null,
    });
    expect(fakeTables["forge_relay_claims"]?.[0]?.code_hash).not.toBe(CODE);
  });

  it("rejects an unsigned request and a malformed code", async () => {
    const unsigned = await startClaim(
      new Request("http://localhost/api/relay/github/claim-start", {
        method: "POST",
        body: JSON.stringify({ code: CODE }),
      }) as never,
    );
    expect(unsigned.status).toBe(401);

    const malformed = await startClaim(request("short") as never);
    expect(malformed.status).toBe(400);
    expect(fakeTables["forge_relay_claims"]).toHaveLength(0);
  });
});

