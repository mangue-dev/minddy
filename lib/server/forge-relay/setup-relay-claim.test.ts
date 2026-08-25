import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * The relay branch of `GET /api/git/github/setup`
 * (docs/managed-forge-relay-plan.md, "Installation claim"): when the state is
 * a forge-relay claim state, the setup reserves one installation and requires
 * a user-scoped GitHub authorization to prove a stable repository identity
 * before the installation is bound. No Cloud session or local connection row
 * applies.
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
  canonicalAppOrigin: () => "http://localhost:3000",
}));

vi.mock("@/lib/server/git/github-user-auth", () => ({
  getGithubUserAuthorizeUrl: ({ state }: { state: string }) =>
    `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}`,
  exchangeGithubUserCode: async () => ({
    accessToken: "verified-user-token",
    expiresAt: null,
    refreshToken: null,
    scope: null,
  }),
  getGithubUserInstallationRepository: async () => ({
    id: 991,
    fullName: "acme/app",
  }),
  getGithubUserAccount: async () => ({ id: 7, login: "octo", avatarUrl: null }),
}));

const upsertGithubConnection = vi.fn();
vi.mock("@/lib/server/git/connections", () => ({
  upsertGithubConnection: (...args: unknown[]) => upsertGithubConnection(...args),
}));
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationAccount: async () => ({ login: "acme", type: "Organization", repositorySelection: "selected" }),
}));

const {
  createPendingRelayClaim,
  signRelayClaimAuthorizationState,
  signRelayClaimState,
} = await import("@/lib/server/forge-relay/claims");
const { GET: setup } = await import("@/app/api/git/github/setup/route");
const { GET: confirmClaim } = await import(
  "@/app/api/relay/github/user-callback/route"
);

function setupRequest(state: string, installationId = "4242") {
  // The route reads `request.nextUrl.searchParams`; a plain Request has none.
  return {
    nextUrl: new URL(
      `http://localhost/api/git/github/setup?installation_id=${installationId}&state=${encodeURIComponent(state)}`,
    ),
  } as never;
}

function callbackRequest(state: string) {
  return {
    nextUrl: new URL(
      `http://localhost/api/relay/github/user-callback?code=oauth-code&state=${encodeURIComponent(state)}`,
    ),
  } as never;
}

async function prepareClaim(): Promise<string> {
  await expect(
    createPendingRelayClaim({ instanceId: INSTANCE_ID, code: CODE }),
  ).resolves.toEqual({ ok: true });
  return signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
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
  it("binds only after user authorization verifies the installation repository", async () => {
    const state = await prepareClaim();
    const setupResponse = await setup(setupRequest(state));

    expect(setupResponse.status).toBe(307);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      status: "verifying",
      installation_id: 4242,
    });

    const authorizationUrl = new URL(
      setupResponse.headers.get("location") as string,
    );
    const response = await confirmClaim(
      callbackRequest(authorizationUrl.searchParams.get("state") as string),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("GitHub connected");
    expect(html).toContain("4242");
    expect(fakeTables["forge_relay_installations"]?.[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      installation_id: 4242,
    });
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      status: "claimed",
      repository_id: 991,
      repository_full_name: "acme/app",
    });
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("reports a failure without writing when the instance is revoked", async () => {
    const state = await prepareClaim();
    fakeTables["forge_relay_instances"]![0]!.status = "revoked";
    const response = await setup(setupRequest(state));

    expect(response.status).toBe(409);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("reports a missing installation id as a claim failure", async () => {
    const state = await prepareClaim();
    const response = await setup(setupRequest(state, ""));
    expect(response.status).toBe(400);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
  });

  it("stays closed by the kill switch even for a well-formed claim", async () => {
    const state = await prepareClaim();
    forgeEnabled = false;
    const response = await setup(setupRequest(state));
    expect(response.status).toBe(503);
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(upsertGithubConnection).not.toHaveBeenCalled();
  });

  it("refuses an installation already connected to a Cloud account", async () => {
    const state = await prepareClaim();
    setFakeTable("git_connections", [
      { id: "conn-cloud-1", installation_id: 4242, user_id: "cloud-user" },
    ]);
    const setupResponse = await setup(setupRequest(state));
    const authorizationUrl = new URL(
      setupResponse.headers.get("location") as string,
    );
    const response = await confirmClaim(
      callbackRequest(authorizationUrl.searchParams.get("state") as string),
    );
    expect(response.status).toBe(409);
    const html = await response.text();
    expect(html).toContain("already connected");
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
  });

  it("refuses an authorized callback that swaps the reserved installation", async () => {
    const state = await prepareClaim();
    const setupResponse = await setup(setupRequest(state, "4242"));
    expect(setupResponse.status).toBe(307);

    const swappedState = signRelayClaimAuthorizationState({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 9999,
    });
    const response = await confirmClaim(callbackRequest(swappedState));
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("does not match");
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
  });
});
