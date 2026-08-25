import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
  setFakeInsertError,
} from "../../../test/forge-relay/fake-supabase";

/**
 * Control-plane routes of the managed forge relay (Phase 2):
 * `POST /api/relay/github/installation-token`, `POST /api/relay/links`, and
 * the admin instance registry. The full request path is exercised with REAL
 * Ed25519 signatures — only the database, the GitHub mint, and the auth
 * guards are faked.
 */

let forgeEnabled = true;
let admin = true;

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true as const,
    user: { id: "admin-user-id" },
    supabase: {},
    response: null,
  }),
}));
vi.mock("@/lib/server/admin", () => ({
  isAdminUser: async () => admin,
}));

const mintCalls: {
  installationId: number | string;
  scope?: { repositories?: string[]; permissions?: Record<string, string> };
}[] = [];

vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationToken: async (
    installationId: number | string,
    scope?: { repositories?: string[]; permissions?: Record<string, string> },
  ) => {
    mintCalls.push({ installationId, scope });
    return { token: "minted-token", expiresAt: "2026-08-21T13:00:00Z" };
  },
  getInstallationAccount: async () => ({ login: "acme", type: "Organization", repositorySelection: "selected" }),
}));

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

function generateInstanceKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

const { publicKeyPem, privateKeyPem } = generateInstanceKeys();
const { signRelayRequest } = await import("@/lib/server/forge-relay/protocol");

function seedRelayWorld(): void {
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
      repo_full_name: "acme/app",
      connection_id: "conn-1",
      updated_at: new Date().toISOString(),
    },
  ]);
  setFakeTable("forge_relay_audit", []);
  setFakeTable("forge_relay_instances_public", []);
  setFakeTable("forge_relay_deliveries", [
    {
      id: "delivery-pending",
      instance_id: INSTANCE_ID,
      status: "pending",
      last_error: null,
    },
    {
      id: "delivery-complete",
      instance_id: INSTANCE_ID,
      status: "delivered",
      last_error: null,
    },
  ]);
}

function signedRequest(
  path: string,
  rawBody: string,
  overrides: Partial<Parameters<typeof signRelayRequest>[0]> = {},
): Request {
  const signature = signRelayRequest({
    method: "POST",
    path,
    rawBody,
    instanceId: INSTANCE_ID,
    privateKey: privateKeyPem,
    ...overrides,
  });
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: signature,
    body: rawBody,
  }) as unknown as Request;
}

const { POST: mintToken } = await import("@/app/api/relay/github/installation-token/route");
const { POST: relayLinks } = await import("@/app/api/relay/links/route");
const { GET: listInstances, POST: registerInstance } = await import(
  "@/app/api/admin/forge-relay/instances/route"
);
const { DELETE: revokeInstance } = await import(
  "@/app/api/admin/forge-relay/instances/[id]/route"
);

beforeEach(() => {
  forgeEnabled = true;
  admin = true;
  mintCalls.length = 0;
  setFakeInsertError(null);
  seedRelayWorld();
});

describe("POST /api/relay/github/installation-token", () => {
  const path = "/api/relay/github/installation-token";
  const body = JSON.stringify({
    installationId: 4242,
    repositories: ["app"],
    profile: "repo-write",
  });

  it("stays unavailable when the managed forge relay is not configured", async () => {
    forgeEnabled = false;
    const response = await mintToken(signedRequest(path, body) as never);
    expect(response.status).toBe(503);
  });

  it("rejects an unsigned request", async () => {
    const response = await mintToken(
      new Request(`http://localhost${path}`, { method: "POST", body }) as never,
    );
    expect(response.status).toBe(401);
  });

  it("refuses a payload that does not respect the wire constraints", async () => {
    const response = await mintToken(
      signedRequest(path, JSON.stringify({ installationId: 4242, repositories: ["acme/app"] })) as never,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("SHORT") });
  });

  it("refuses a payload without a known permission profile", async () => {
    // An empty permissions object used to mint ALL of the app's permissions.
    for (const payload of [
      { installationId: 4242, repositories: ["app"] },
      { installationId: 4242, repositories: ["app"], profile: "sudo" },
    ]) {
      const response = await mintToken(signedRequest(path, JSON.stringify(payload)) as never);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("profile"),
      });
    }
  });

  it("refuses an installation this instance has not claimed", async () => {
    const response = await mintToken(
      signedRequest(
        path,
        JSON.stringify({ installationId: 9999, repositories: ["app"], profile: "repo-write" }),
      ) as never,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("not claimed") });
  });

  it("refuses a repository that is not mirrored as linked (fail-closed)", async () => {
    const response = await mintToken(
      signedRequest(
        path,
        JSON.stringify({ installationId: 4242, repositories: ["other"], profile: "repo-write" }),
      ) as never,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("not linked") });
  });

  it("mints a scoped token for a claimed installation and a linked repository", async () => {
    const response = await mintToken(signedRequest(path, body) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: "minted-token",
      expiresAt: "2026-08-21T13:00:00Z",
    });
    expect(mintCalls).toEqual([
      {
        installationId: 4242,
        scope: { repositories: ["app"], permissions: { contents: "write" } },
      },
    ]);
  });

  it("maps the full profile to an unrestricted mint, explicitly", async () => {
    const response = await mintToken(
      signedRequest(
        path,
        JSON.stringify({ installationId: 4242, repositories: ["app"], profile: "full" }),
      ) as never,
    );
    expect(response.status).toBe(200);
    expect(mintCalls).toEqual([
      { installationId: 4242, scope: { repositories: ["app"], permissions: undefined } },
    ]);
  });

  it("enforces the per-instance mint quota over the audit ledger", async () => {
    setFakeTable(
      "forge_relay_audit",
      Array.from({ length: 120 }, (_, index) => ({
        id: index + 1,
        instance_id: INSTANCE_ID,
        action: "mint_installation_token",
        detail: {},
        created_at: new Date().toISOString(),
      })),
    );
    const response = await mintToken(signedRequest(path, body) as never);
    expect(response.status).toBe(429);
    expect(mintCalls).toHaveLength(0);
  });
});

describe("POST /api/relay/links", () => {
  const path = "/api/relay/links";

  it("rejects an invalid payload", async () => {
    const response = await relayLinks(
      signedRequest(path, JSON.stringify({ events: [{ event: "linked", provider: "github", repo: "no-slash" }] })) as never,
    );
    expect(response.status).toBe(400);
  });

  it("applies link events and reconciliation snapshots to the mirror", async () => {
    const response = await relayLinks(
      signedRequest(
        path,
        JSON.stringify({
          events: [
            { event: "linked", provider: "gitlab", repo: "acme/gitlab-app", connectionId: "conn-9" },
            { event: "unlinked", provider: "github", repo: "acme/app" },
          ],
          snapshot: [
            { provider: "github", repo: "acme/kept", connectionId: "conn-2" },
            { provider: "gitlab", repo: "acme/gitlab-app", connectionId: "conn-9" },
          ],
        }),
      ) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });

    const mirror = (fakeTables["forge_relay_link_mirror"] ?? []).map(
      (row) => `${row.provider}:${row.repo_full_name}`,
    );
    expect(mirror.sort()).toEqual(["github:acme/kept", "gitlab:acme/gitlab-app"]);
  });
});

describe("admin instance registry", () => {
  it("stays unavailable and admin-only", async () => {
    forgeEnabled = false;
    expect((await listInstances({} as never)).status).toBe(503);

    forgeEnabled = true;
    admin = false;
    expect(
      (await registerInstance(
        new Request("http://localhost/api/admin/forge-relay/instances", {
          method: "POST",
          body: JSON.stringify({ name: "x", publicKey: publicKeyPem }),
        }) as never,
      )).status,
    ).toBe(403);
  });

  it("registers an instance from its Ed25519 public key", async () => {
    const response = await registerInstance(
      new Request("http://localhost/api/admin/forge-relay/instances", {
        method: "POST",
        body: JSON.stringify({ name: "branch-vm", publicKey: publicKeyPem }),
      }) as never,
    );
    expect(response.status).toBe(201);
    const instances = fakeTables["forge_relay_instances"] ?? [];
    expect(instances).toHaveLength(2);
    expect(instances[1]).toMatchObject({ name: "branch-vm", public_key: publicKeyPem });
  });

  it("refuses an invalid key and a duplicate registration", async () => {
    const invalid = await registerInstance(
      new Request("http://localhost/api/admin/forge-relay/instances", {
        method: "POST",
        body: JSON.stringify({ name: "branch-vm", publicKey: "not-a-key" }),
      }) as never,
    );
    expect(invalid.status).toBe(400);

    setFakeInsertError({ code: "23505", message: "duplicate" });
    const duplicate = await registerInstance(
      new Request("http://localhost/api/admin/forge-relay/instances", {
        method: "POST",
        body: JSON.stringify({ name: "branch-vm", publicKey: publicKeyPem }),
      }) as never,
    );
    expect(duplicate.status).toBe(400);
    await expect(duplicate.json()).resolves.toMatchObject({ error: expect.stringContaining("already registered") });
  });

  it("revokes an active instance, invalidates its queue, and reports an unknown one", async () => {
    const response = await revokeInstance({} as never, {
      params: Promise.resolve({ id: INSTANCE_ID }),
    } as never);
    expect(response.status).toBe(200);
    expect(fakeTables["forge_relay_instances"]?.[0]).toMatchObject({
      status: "revoked",
      webhook_url: null,
      webhook_secret_encrypted: null,
    });
    expect(fakeTables["forge_relay_deliveries"]).toEqual([
      expect.objectContaining({
        id: "delivery-pending",
        status: "dead",
        last_error: "relay instance revoked",
      }),
      expect.objectContaining({ id: "delivery-complete", status: "delivered" }),
    ]);

    const retry = await revokeInstance({} as never, {
      params: Promise.resolve({ id: INSTANCE_ID }),
    } as never);
    expect(retry.status).toBe(200);

    const missing = await revokeInstance({} as never, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    } as never);
    expect(missing.status).toBe(404);
  });
});
