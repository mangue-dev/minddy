import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * The relay branch of `GET /api/git/github/setup`
 * (docs/managed-forge-relay-plan.md, "Installation claim"): when the state is
 * a forge-relay claim state, the installation is bound to the claiming
 * INSTANCE and the operator gets a plain confirmation — no Cloud user session
 * applies, and no local connection row is written.
 */

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const CODE = "b".repeat(64);

let forgeEnabled = true;
vi.mock("@/lib/managed-services", () => ({
  isManagedForgeEnabled: () => forgeEnabled,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/server/git/link-state", () => ({
  verifyGitLinkState: () => null,
  ACCOUNT_CONNECT_PROJECT: "__account__",
}));
vi.mock("@/lib/server/git/callback-session", () => ({
  readForgeCallbackSession: async () => ({
    userId: "session-user" as string | null,
    applyCookies: (response: unknown) => response,
  }),
  sessionMatchesState: () => true,
}));
vi.mock("@/lib/server/app-origin", () => ({
  canonicalAppOrigin: () => new URL("http://localhost:3000"),
}));

const upsertGithubConnection = vi.fn();
vi.mock("@/lib/server/git/connections", () => ({
  upsertGithubConnection: (...args: unknown[]) => upsertGithubConnection(...args),
}));
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationAccount: async () => ({ login: "acme", type: "Organization", repositorySelection: "selected" }),
}));

const { signRelayClaimState } = await import("@/lib/server/forge-relay/claims");
const { GET: setup } = await import("@/app/api/git/github/setup/route");

function setupRequest(state: string, installationId = "4242") {
  // The route reads `request.nextUrl.searchParams`; a plain Request has none.
  return {
    nextUrl: new URL(
      `http://localhost/api/git/github/setup?installation_id=${installationId}&state=${encodeURIComponent(state)}`,
    ),
  } as never;
}

beforeEach(() => {
  forgeEnabled = true;
  upsertGithubConnection.mockReset();
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: "unused",
      status: "active",
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  ]);
  setFakeTable("forge_relay_installations", []);
  setFakeTable("forge_relay_claims", []);
  setFakeTable("git_connections", []);
});

describe("GET /api/git/github/setup — relay claim branch", () => {
  it("binds the installation to the instance and confirms, without a local connection", async () => {
    const state = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const response = await setup(setupRequest(state));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("GitHub connected");
    expect(html).toContain("4242");
    expect(fakeTables["forge_relay_installations"]?.[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      installation_id: 4242,
    });
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({ status: "claimed" });
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("reports a failure without writing when the instance is revoked", async () => {
    fakeTables["forge_relay_instances"]![0]!.status = "revoked";
    const state = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const response = await setup(setupRequest(state));

    expect(response.status).toBe(403);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("reports a missing installation id as a claim failure", async () => {
    const state = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const response = await setup(setupRequest(state, ""));
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
  });

  it("stays closed by the kill switch even for a well-formed claim", async () => {
    forgeEnabled = false;
    const state = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const response = await setup(setupRequest(state));
    expect(response.status).toBe(503);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("refuses an installation already connected to a Cloud account", async () => {
    setFakeTable("git_connections", [
      { id: "conn-cloud-1", installation_id: 4242, user_id: "cloud-user" },
    ]);
    const state = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const response = await setup(setupRequest(state));
    expect(response.status).toBe(409);
    const html = await response.text();
    expect(html).toContain("already connected");
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
  });
});
