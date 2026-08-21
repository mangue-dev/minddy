import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import { FakeQuery, setFakeTable } from "../../../test/forge-relay/fake-supabase";

/**
 * The start branch of `POST /api/account/git-identities` for RELAYED
 * instances: instead of talking to GitHub directly (no local client
 * id/secret), the user is redirected to the managed relay's broker entry with
 * an Ed25619-signed state. Everything else about the flow stays local.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

let relayConfigured = true;

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true as const,
    user: { id: "user-on-instance" },
    supabase: {},
    response: null,
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/git/user-identities", () => ({
  listUserIdentities: async () => [],
}));
vi.mock("@/lib/server/git/account-refresh", () => ({
  refreshForgeAccountNames: async () => {},
}));
vi.mock("@/lib/server/git/link-state", () => ({
  signGitLinkState: vi.fn(() => "local-state"),
  ACCOUNT_CONNECT_PROJECT: "__account__",
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  isGitlabConfigured: () => false,
  isLocalGitlabOAuthConfigured: () => false,
  getGitlabAuthorizeUrl: vi.fn(() => "https://gitlab.com/oauth/authorize"),
}));
vi.mock("@/lib/server/app-origin", () => ({
  canonicalAppOrigin: () => "https://on-prem.example.com",
}));

const getGithubUserAuthorizeUrl = vi.fn(
  ({ redirectUri, state }: { redirectUri: string; state: string }) =>
    `https://github.com/login/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
);
let localGithubUserAuth = false;
vi.mock("@/lib/server/git/github-user-auth", () => ({
  isGithubUserAuthConfigured: () => true,
  // The documented precedence (docs/managed-forge-relay-plan.md): with local
  // credentials, new authorizations stay local even when the relay answers.
  isLocalGithubUserAuthConfigured: () => localGithubUserAuth,
  getGithubUserAuthorizeUrl: (args: { redirectUri: string; state: string }) =>
    getGithubUserAuthorizeUrl(args),
}));

const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => relayConfigured,
  forgeRelayConfig: () => ({
    url: "https://relay.example.com",
    instanceId: INSTANCE_ID,
    secret: privateKeyPem,
  }),
  forgeRelaySigningKey: () => privateKeyPem,
  relayRequest: async () => {
    throw new Error("not used in this test");
  },
}));

function seedInstance(): void {
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
}

const { POST: startIdentity } = await import("@/app/api/account/git-identities/route");
const { verifyRelayUserState } = await import("@/lib/server/forge-relay/user-broker");

function startRequest(provider: string): never {
  return {
    nextUrl: new URL("http://localhost/api/account/git-identities"),
    json: async () => ({ action: "start", provider, origin: "settings" }),
  } as never;
}

beforeEach(() => {
  relayConfigured = true;
  localGithubUserAuth = false;
  getGithubUserAuthorizeUrl.mockClear();
  seedInstance();
});

describe("POST /api/account/git-identities — relayed GitHub authorization", () => {
  it("redirects to the relay broker with a verifiable instance-signed state", async () => {
    const response = await startIdentity(startRequest("github"));
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(url).toContain("https://relay.example.com/api/relay/github/user-authorize?");
    expect(url).toContain(`instance=${INSTANCE_ID}`);
    expect(getGithubUserAuthorizeUrl).not.toHaveBeenCalled();

    const state = new URL(url).searchParams.get("state");
    await expect(verifyRelayUserState(INSTANCE_ID, state)).resolves.toMatchObject({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      origin: "settings",
      callbackOrigin: "https://on-prem.example.com",
    });
  });

  it("keeps the direct GitHub flow when the relay is not configured", async () => {
    relayConfigured = false;
    const response = await startIdentity(startRequest("github"));
    const { url } = (await response.json()) as { url: string };
    expect(url).toContain("https://github.com/login/oauth/authorize");
    expect(getGithubUserAuthorizeUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps the direct GitHub flow when a LOCAL app is configured too — local wins", async () => {
    // Mixed setup: both channels are reachable, and the documented precedence
    // gives new connections to the operator-owned app.
    localGithubUserAuth = true;
    const response = await startIdentity(startRequest("github"));
    const { url } = (await response.json()) as { url: string };
    expect(url).toContain("https://github.com/login/oauth/authorize");
    expect(getGithubUserAuthorizeUrl).toHaveBeenCalledTimes(1);
  });
});
