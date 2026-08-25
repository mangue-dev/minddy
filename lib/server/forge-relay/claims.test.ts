import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * GitHub installation claim flow, Cloud side
 * (docs/managed-forge-relay-plan.md, "Installation claim").
 *
 * Pinned properties: the claim state is HMAC-signed and short-lived; the code
 * is stored only as a hash; an installation already bound to ANOTHER instance
 * is refused (the blast radius of a claim never crosses instances); the poll
 * is single-consumption but idempotent for its author.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";
const CODE = "a".repeat(64);
const STATE_SECRET = "state-secret-0123456789abcdef0123456789abcdef";
const VERIFIED_REPOSITORY = {
  repositoryId: 991,
  repositoryFullName: "acme/app",
};

vi.stubEnv("GIT_STATE_SECRET", STATE_SECRET);

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));
/** Overridden by the missing-login test. */
let installationAccount: {
  login: string;
  type: string;
  repositorySelection: string;
} | null = {
  login: "acme",
  type: "Organization",
  repositorySelection: "selected",
};
vi.mock("@/lib/server/git/github-app", () => ({
  getInstallationAccount: async () => installationAccount,
}));

function seedInstance(status = "active"): void {
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: "unused",
      status,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  ]);
  setFakeTable("forge_relay_installations", []);
  setFakeTable("forge_relay_claims", []);
  setFakeTable("git_connections", []);
}

const {
  signRelayClaimState,
  signRelayClaimAuthorizationState,
  verifyRelayClaimAuthorizationState,
  verifyRelayClaimState,
  isValidClaimCode,
  generateClaimCode,
  createPendingRelayClaim,
  reserveRelayClaimInstallation,
  bindRelayClaim,
  consumeRelayClaim,
  claimCodeBelongsToAccount,
  generateAccountBoundClaimCode,
} = await import("./claims");

async function prepareClaim(installationId = 4242): Promise<void> {
  await expect(
    createPendingRelayClaim({ instanceId: INSTANCE_ID, code: CODE }),
  ).resolves.toEqual({ ok: true });
  await expect(
    reserveRelayClaimInstallation({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId,
    }),
  ).resolves.toBe(true);
}

beforeEach(() => {
  installationAccount = { login: "acme", type: "Organization", repositorySelection: "selected" };
  seedInstance();
});

describe("claim state", () => {
  it("round-trips a signed claim state", () => {
    const token = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    expect(verifyRelayClaimState(token)).toEqual({
      instanceId: INSTANCE_ID,
      code: CODE,
    });
  });

  it("rejects a tampered, expired, or foreign-kind state", () => {
    const token = signRelayClaimState({ instanceId: INSTANCE_ID, code: CODE });
    const [body, signature] = token.split(".");
    expect(verifyRelayClaimState(`${`${"x".repeat(body.length)}`}.${signature}`)).toBeNull();

    const stale = signRelayClaimState({
      instanceId: INSTANCE_ID,
      code: CODE,
      now: Date.now() - 30 * 60_000,
    });
    expect(verifyRelayClaimState(stale)).toBeNull();

    // A LOCAL git-link state must never be mistaken for a claim state.
    const foreign = `${Buffer.from(
      JSON.stringify({ projectId: "p", userId: "u", provider: "github", iat: Date.now() }),
    ).toString("base64url")}.${signature}`;
    expect(verifyRelayClaimState(foreign)).toBeNull();
    expect(verifyRelayClaimState(null)).toBeNull();
  });

  it("validates claim codes and generates 256-bit codes", () => {
    expect(isValidClaimCode(CODE)).toBe(true);
    expect(isValidClaimCode("short")).toBe(false);
    expect(isValidClaimCode(`${"g".repeat(64)}`)).toBe(false);
    expect(generateClaimCode()).toMatch(/^[0-9a-f]{64}$/);
    const bound = generateAccountBoundClaimCode({
      userId: "user-a",
      secret: "instance-secret",
    });
    expect(bound).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(isValidClaimCode(bound)).toBe(true);
    expect(
      claimCodeBelongsToAccount(bound, "user-a", "instance-secret"),
    ).toBe(true);
    expect(
      claimCodeBelongsToAccount(bound, "user-b", "instance-secret"),
    ).toBe(false);
  });

  it("binds the authorization state to the reserved installation", () => {
    const token = signRelayClaimAuthorizationState({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
    });
    expect(verifyRelayClaimAuthorizationState(token)).toEqual({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
    });
    expect(verifyRelayClaimAuthorizationState(`${token}x`)).toBeNull();
  });
});

describe("bindRelayClaim", () => {
  it("binds the installation and records the claim handoff", async () => {
    await prepareClaim();
    const binding = await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      ...VERIFIED_REPOSITORY,
    });
    expect(binding).toEqual({ ok: true, installationId: 4242, accountLogin: "acme" });
    expect(fakeTables["forge_relay_installations"]).toHaveLength(1);
    expect(fakeTables["forge_relay_installations"]?.[0]).toMatchObject({
      instance_id: INSTANCE_ID,
      installation_id: 4242,
      account_login: "acme",
    });
    // The code itself is never stored — only its hash.
    const claim = fakeTables["forge_relay_claims"]?.[0] as Record<string, unknown>;
    expect(claim).toMatchObject({ status: "claimed", installation_id: 4242 });
    expect(claim).toMatchObject({
      repository_id: VERIFIED_REPOSITORY.repositoryId,
      repository_full_name: VERIFIED_REPOSITORY.repositoryFullName,
    });
    expect(claim.code_hash).not.toBe(CODE);
    expect(String(claim.code_hash)).toHaveLength(64);
  });

  it("refuses an installation already claimed by ANOTHER instance", async () => {
    await prepareClaim();
    setFakeTable("forge_relay_installations", [
      {
        id: "other-binding",
        instance_id: "11111111-1111-4111-8111-111111111111",
        installation_id: 4242,
        account_login: "acme",
        claimed_at: new Date().toISOString(),
      },
    ]);
    const binding = await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      ...VERIFIED_REPOSITORY,
    });
    expect(binding).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses an installation already connected to a Cloud account", async () => {
    await prepareClaim();
    // The webhook receiver routes claimed installations to their instance and
    // skips local handlers: claiming a Cloud-connected installation would cut
    // every Cloud project linked to it off its events.
    setFakeTable("git_connections", [
      { id: "conn-cloud", installation_id: 4242, user_id: "cloud-user" },
    ]);
    const binding = await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      ...VERIFIED_REPOSITORY,
    });
    expect(binding).toMatchObject({ ok: false, status: 409 });
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      status: "verifying",
      installation_id: 4242,
    });
  });

  it("reports a missing installation account as a retryable failure, not a 500", async () => {
    // A transient GitHub failure during the setup landing must not hit the
    // NOT NULL column as a 23502 — and nothing is written.
    installationAccount = null;
    await prepareClaim();
    const binding = await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      ...VERIFIED_REPOSITORY,
    });
    expect(binding).toMatchObject({ ok: false, status: 502 });
    expect(String(binding.ok ? "" : binding.error)).toContain("restart");
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      status: "verifying",
      installation_id: 4242,
    });
  });

  it("refuses a repository identity from another installation account", async () => {
    await prepareClaim();
    const binding = await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      repositoryId: 992,
      repositoryFullName: "other-org/app",
    });
    expect(binding).toMatchObject({ ok: false, status: 409 });
    expect(String(binding.ok ? "" : binding.error)).toContain(
      "installation account",
    );
    expect(fakeTables["forge_relay_installations"]).toHaveLength(0);
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({
      status: "verifying",
      installation_id: 4242,
    });
  });

  it("refuses an unknown or revoked instance and an invalid installation id", async () => {
    await expect(
      bindRelayClaim({ instanceId: "00000000-0000-4000-8000-000000000000", code: CODE, installationId: 4242, ...VERIFIED_REPOSITORY }),
    ).resolves.toMatchObject({ ok: false, status: 403 });

    seedInstance("revoked");
    await expect(
      bindRelayClaim({ instanceId: INSTANCE_ID, code: CODE, installationId: 4242, ...VERIFIED_REPOSITORY }),
    ).resolves.toMatchObject({ ok: false, status: 403 });

    seedInstance();
    await expect(
      bindRelayClaim({ instanceId: INSTANCE_ID, code: CODE, installationId: -1, ...VERIFIED_REPOSITORY }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });
});

describe("consumeRelayClaim", () => {
  it("reports pending when no claim exists", async () => {
    await expect(consumeRelayClaim({ instanceId: INSTANCE_ID, code: CODE })).resolves.toEqual({
      status: "pending",
    });
  });

  it("returns the binding once and rejects a replay", async () => {
    await prepareClaim();
    await bindRelayClaim({
      instanceId: INSTANCE_ID,
      code: CODE,
      installationId: 4242,
      ...VERIFIED_REPOSITORY,
    });

    const first = await consumeRelayClaim({ instanceId: INSTANCE_ID, code: CODE });
    expect(first).toEqual({ status: "claimed", installationId: 4242, accountLogin: "acme" });
    expect(fakeTables["forge_relay_claims"]?.[0]).toMatchObject({ status: "consumed" });

    await expect(consumeRelayClaim({ instanceId: INSTANCE_ID, code: CODE })).resolves.toEqual({
      status: "pending",
    });
  });
});
