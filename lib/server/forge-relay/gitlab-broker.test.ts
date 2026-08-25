import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

import {
  FakeQuery,
  fakeTables,
  setFakeTable,
} from "../../../test/forge-relay/fake-supabase";

/**
 * GitLab OAuth broker + hook-secret handoff
 * (docs/managed-forge-relay-plan.md, "GitLab flows").
 *
 * Pinned properties: the instance-signed state is unfalsifiable; the token
 * pair is stored encrypted and handed out only to its instance with the
 * matching provider (a GitHub delivery never satisfies a GitLab fetch); the
 * hook secret lands in the mirror encrypted, upserting a minimal row when the
 * link event was lost.
 */

const INSTANCE_ID = "0f0e0d0c-0b0a-4948-8272-6d6f64656c79";

vi.stubEnv("GIT_STATE_SECRET", "state-secret-0123456789abcdef0123456789abcdef");
vi.stubEnv("GIT_TOKEN_ENCRYPTION_SECRET", "token-crypto-secret-0123456789abcdef");

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => new FakeQuery(name) }),
}));

const { publicKeyPem, privateKeyPem } = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
})();

function seedInstance(status = "active"): void {
  setFakeTable("forge_relay_instances", [
    {
      id: INSTANCE_ID,
      name: "on-prem",
      public_key: publicKeyPem,
      status,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  ]);
  setFakeTable("forge_relay_user_deliveries", []);
  setFakeTable("forge_relay_link_mirror", []);
}

const {
  signRelayGitlabState,
  signCloudGitlabState,
  verifyCloudGitlabState,
  createGitlabTokenDelivery,
  consumeGitlabTokenDelivery,
  gitlabHookTokenDigest,
  registerGitlabHookSecret,
} = await import("./gitlab-broker");
const { verifyInstanceSignedState } = await import("./user-broker");

beforeEach(() => {
  seedInstance();
});

describe("instance-signed GitLab authorization state", () => {
  it("round-trips against the registered public key", async () => {
    const token = signRelayGitlabState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    await expect(
      verifyInstanceSignedState(INSTANCE_ID, token, "forge-relay-gitlab-authorize"),
    ).resolves.toMatchObject({
      instanceId: INSTANCE_ID,
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
    });
  });

  it("carries the instance-relative return path through verification", async () => {
    const token = signRelayGitlabState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      returnPath: "/projects/p-1/settings?tab=git",
      privateKey: privateKeyPem,
    });
    await expect(
      verifyInstanceSignedState(INSTANCE_ID, token, "forge-relay-gitlab-authorize"),
    ).resolves.toMatchObject({
      returnPath: "/projects/p-1/settings?tab=git",
    });

    // An exotic return path is dropped at verification, never propagated.
    const hostile = signRelayGitlabState({
      userId: "user-on-instance",
      callbackOrigin: "https://on-prem.example.com",
      returnPath: "https://evil.example/phishing",
      privateKey: privateKeyPem,
    });
    const verified = await verifyInstanceSignedState(
      INSTANCE_ID,
      hostile,
      "forge-relay-gitlab-authorize",
    );
    expect(verified?.returnPath).toBeUndefined();
  });

  it("rejects a tampered state and a GitHub-kind state", async () => {
    const token = signRelayGitlabState({
      userId: "u",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    const [body, signature] = token.split(".");
    await expect(
      verifyInstanceSignedState(INSTANCE_ID, `${body}x.${signature}`, "forge-relay-gitlab-authorize"),
    ).resolves.toBeNull();

    // A state signed for the GITHUB broker must not open the GitLab flow.
    const { signRelayUserState } = await import("./user-broker");
    const githubState = signRelayUserState({
      userId: "u",
      callbackOrigin: "https://on-prem.example.com",
      privateKey: privateKeyPem,
    });
    await expect(
      verifyInstanceSignedState(INSTANCE_ID, githubState, "forge-relay-gitlab-authorize"),
    ).resolves.toBeNull();
  });
});

describe("cloud-signed GitLab state", () => {
  it("round-trips and rejects tampering", () => {
    const token = signCloudGitlabState({
      instanceId: INSTANCE_ID,
      userId: "u",
      callbackOrigin: "https://on-prem.example.com",
      returnPath: "/projects/p-1/settings?tab=git",
    });
    expect(verifyCloudGitlabState(token)).toMatchObject({
      instanceId: INSTANCE_ID,
      returnPath: "/projects/p-1/settings?tab=git",
    });
    expect(verifyCloudGitlabState(`${token}x`)).toBeNull();
  });

  it("drops an exotic return path instead of propagating it", () => {
    const token = signCloudGitlabState({
      instanceId: INSTANCE_ID,
      userId: "u",
      callbackOrigin: "https://on-prem.example.com",
      returnPath: "//evil.example",
    });
    const verified = verifyCloudGitlabState(token);
    expect(verified?.returnPath).toBeUndefined();
  });
});

describe("GitLab token deliveries", () => {
  const DELIVERY = {
    userId: "user-on-instance",
    account: { id: 42, login: "octo", avatarUrl: null },
    tokens: {
      accessToken: "gitlab-access-token",
      expiresAt: "2026-08-21T20:00:00Z",
      refreshToken: "gitlab-refresh-token",
      scope: "api",
    },
  };

  it("hands the token pair to its instance — and only through the GitLab channel", async () => {
    const deliveryId = await createGitlabTokenDelivery({
      instanceId: INSTANCE_ID,
      delivery: DELIVERY,
    });

    // A GitHub-channel fetch must NOT satisfy a GitLab delivery.
    const { consumeUserDelivery } = await import("./user-broker");
    await expect(
      consumeUserDelivery({ instanceId: INSTANCE_ID, deliveryId, provider: "github" }),
    ).resolves.toEqual({ status: "pending" });

    const result = await consumeGitlabTokenDelivery({ instanceId: INSTANCE_ID, deliveryId });
    expect(result).toEqual({ status: "delivered", delivery: DELIVERY });
  });
});

describe("registerGitlabHookSecret", () => {
  it("stores the per-repo secret ENCRYPTED in the mirror, upserting a minimal row", async () => {
    const ok = await registerGitlabHookSecret({
      instanceId: INSTANCE_ID,
      repoId: "1001",
      repo: "acme/app",
      secret: "per-repo-hook-secret-0123456789abcdef",
    });
    expect(ok).toBe(true);
    const row = fakeTables["forge_relay_link_mirror"]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      instance_id: INSTANCE_ID,
      provider: "gitlab",
      external_repo_id: "1001",
      repo_full_name: "acme/app",
    });
    expect(String(row.webhook_secret_encrypted)).not.toContain("per-repo-hook-secret");
    expect(row.webhook_secret_digest).toBe(
      gitlabHookTokenDigest("per-repo-hook-secret-0123456789abcdef"),
    );

    // Lost link event: the minimal row still authorizes verification.
    const again = await registerGitlabHookSecret({
      instanceId: INSTANCE_ID,
      repoId: "1002",
      repo: "acme/other",
      secret: "per-repo-hook-secret-0123456789abcdef",
    });
    expect(again).toBe(true);
    expect(fakeTables["forge_relay_link_mirror"]).toHaveLength(2);
  });

  it("refuses a malformed repo or a weak secret", async () => {
    expect(
      await registerGitlabHookSecret({ instanceId: INSTANCE_ID, repoId: "1001", repo: "no-slash", secret: "x".repeat(40) }),
    ).toBe(false);
    expect(
      await registerGitlabHookSecret({ instanceId: INSTANCE_ID, repoId: "1001", repo: "acme/app", secret: "short" }),
    ).toBe(false);
    expect(
      await registerGitlabHookSecret({ instanceId: INSTANCE_ID, repoId: "invalid", repo: "acme/app", secret: "x".repeat(40) }),
    ).toBe(false);
    expect(fakeTables["forge_relay_link_mirror"] ?? []).toHaveLength(0);
  });
});
