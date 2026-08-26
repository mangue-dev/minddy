import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";

/**
 * GitLab webhook secrets, scoped per repository (MIN-333, MIN-435).
 *
 * GitLab exposes a hook token to repository maintainers. A global token would
 * therefore let a maintainer authenticate events for other tenants. Every link
 * for the same `(provider, external_repo_id)` shares one encrypted secret because
 * those links also share the same physical GitLab hook.
 *
 * `GITLAB_WEBHOOK_SECRET` remains only as a migration credential for registered
 * repositories that have no dedicated ciphertext yet. Persisting a dedicated
 * secret is the repository's revocation marker: the global credential is never
 * considered again for that repository, even if decryption later fails.
 */

/** 32 bytes of entropy, in hexadecimal (GitLab accepts the verbatim token). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Constant time comparison of two shared secrets verbatim. */
export function webhookSecretMatches(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The historical migration credential, if it is still deployed. */
export function legacyGitlabWebhookSecret(): string | null {
  return process.env.GITLAB_WEBHOOK_SECRET || null;
}

interface LinkSecretRow {
  id: string;
  connection_id: string;
  repo_full_name: string | null;
  webhook_secret_encrypted: string | null;
}

const SECRET_COLUMNS =
  "id, connection_id, repo_full_name, webhook_secret_encrypted";

async function loadRepoLinks(
  provider: RepoProviderId,
  externalRepoId: string,
): Promise<LinkSecretRow[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_git_links")
    .select(SECRET_COLUMNS)
    .eq("provider", provider)
    .eq("external_repo_id", externalRepoId);
  if (error) {
    throw new Error(`Webhook-secret link lookup failed: ${error.message}`);
  }
  return (data ?? []) as LinkSecretRow[];
}

/**
 * Returns the repository secret, creating and persisting it when absent. Hook
 * provisioning writes this exact value to GitLab.
 *
 * Every link for the repository receives the same value because the links
 * describe one physical hook. An existing value wins; generating a second one
 * would invalidate the shared hook.
 */
export async function ensureRepoWebhookSecret(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<string> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  if (links.length === 0) {
    throw new Error("Cannot initialize a webhook secret for an unlinked repository");
  }
  let existingSecret: string | null = null;
  for (const link of links) {
    const existing = decryptForgeToken(link.webhook_secret_encrypted);
    if (existing) existingSecret ??= existing;
    if (link.webhook_secret_encrypted) {
      if (!existing) throw new Error("Stored webhook secret cannot be decrypted");
    }
  }
  if (existingSecret) {
    const { error } = await getServiceClient()
      .from("project_git_links")
      .update({
        webhook_secret_encrypted: encryptForgeToken(existingSecret),
        updated_at: new Date().toISOString(),
      })
      .eq("provider", params.provider)
      .eq("external_repo_id", params.externalRepoId)
      .is("webhook_secret_encrypted", null);
    if (error) throw new Error(error.message);
    return existingSecret;
  }

  // The conditional update is the cross-instance initialization claim. When
  // two workers generate concurrently, only the first can replace NULL; every
  // loser reloads and returns that persisted winner instead of configuring a
  // hook with a secret the receiver will never accept.
  const secret = generateWebhookSecret();
  const service = getServiceClient();
  const { data: written, error } = await service
    .from("project_git_links")
    .update({
      webhook_secret_encrypted: encryptForgeToken(secret),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", params.provider)
    .eq("external_repo_id", params.externalRepoId)
    .is("webhook_secret_encrypted", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (written?.length) return secret;

  const raced = await loadRepoLinks(params.provider, params.externalRepoId);
  for (const link of raced) {
    const winner = decryptForgeToken(link.webhook_secret_encrypted);
    if (winner) return winner;
  }
  throw new Error("Webhook-secret initialization lost without a persisted winner");
}

/**
 * Replaces the secret on every link for a repository and returns the new value.
 * The caller must then update the GitLab hook; until it does, deliveries signed
 * with the previous value are intentionally rejected.
 */
export async function rotateRepoWebhookSecret(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<string> {
  const secret = generateWebhookSecret();
  const service = getServiceClient();
  const { error } = await service
    .from("project_git_links")
    .update({
      webhook_secret_encrypted: encryptForgeToken(secret),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", params.provider)
    .eq("external_repo_id", params.externalRepoId);
  if (error) throw new Error(error.message);
  return secret;
}

/** What a webhook check found as material to compare. */
export interface WebhookSecretCandidates {
  /** Repository-specific secrets; multiple values cover a partial rotation. */
  own: string[];
  /** Migration credential, only while this repository has no dedicated secret. */
  legacy: string | null;
  /** A connection that can rewrite the hook during migration. */
  connectionId: string | null;
  /** Registered names bound to the authenticated numeric repository id. */
  repoFullNames: string[];
}

/** All material needed to verify one repository delivery. */
export async function loadWebhookSecrets(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<WebhookSecretCandidates> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  const own: string[] = [];
  const repoFullNames: string[] = [];
  let hasDedicatedSecret = false;
  for (const link of links) {
    hasDedicatedSecret ||= Boolean(link.webhook_secret_encrypted);
    const secret = decryptForgeToken(link.webhook_secret_encrypted);
    if (secret && !own.includes(secret)) own.push(secret);
    if (link.repo_full_name && !repoFullNames.includes(link.repo_full_name)) {
      repoFullNames.push(link.repo_full_name);
    }
  }
  return {
    own,
    // The legacy credential is a migration path only. Persisting the first
    // repository-specific secret is also the per-repository revocation marker:
    // from that point on, the broadly scoped credential must never authenticate
    // this repository again.
    legacy:
      links.length > 0 && !hasDedicatedSecret
        ? legacyGitlabWebhookSecret()
        : null,
    connectionId: links[0]?.connection_id ?? null,
    repoFullNames,
  };
}

/** Describes which credential authenticated the delivery. */
export type WebhookSecretVerdict = "own" | "legacy" | "rejected";

export function verifyWebhookToken(
  provided: string | null | undefined,
  candidates: WebhookSecretCandidates,
): WebhookSecretVerdict {
  if (candidates.own.some((secret) => webhookSecretMatches(provided, secret))) {
    return "own";
  }
  if (candidates.legacy && webhookSecretMatches(provided, candidates.legacy)) {
    return "legacy";
  }
  return "rejected";
}
