import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";

/**
 * The GitLab webhook secret, BY REPOSITORY (MIN-333).
 *
 * Previously, `GITLAB_WEBHOOK_SECRET` was a unique secret, written in the hook of
 * each tenant. But GitLab SHOWS the token of a hook to anyone who can edit it:
 * any maintainer of a linked repository could read it at home, then forge
 * events for the repositories of others — merge a merge request, make
 * pass a ticket to "finished", in a project that does not concern it. A
 * secret shared between tenants is not a secret, it is a password
 * common.
 *
 * BY REPOSITORY and not by link: at GitLab the hook lives ON the repository, and two
 * projects which link to the same repository physically share this hook, so its
 * token. The secret is therefore carried by all lines `project_git_links` of
 * same `(provider, external_repo_id)`, at the same value.
 *
 * Encrypted at rest with the envelope of the forge tokens — same secret of
 * derivation, same column service-role only.
 *
 * `GITLAB_WEBHOOK_SECRET` survives in FALLBACK, for already installed hooks which still carry it: without it, activating this version would cut all existing
 * syncs for one rotation. The receiver burps the hook at the
 * first event that arrives with (see `rotateGitlabWebhookSecret`), and the
 * fallback turns off by itself repository by repository.
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

/** The historic fallback, if it is still deployed. */
export function legacyGitlabWebhookSecret(): string | null {
  return process.env.GITLAB_WEBHOOK_SECRET || null;
}

interface LinkSecretRow {
  id: string;
  connection_id: string;
  webhook_secret_encrypted: string | null;
}

const SECRET_COLUMNS = "id, connection_id, webhook_secret_encrypted";

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
    console.error("[webhook-secret] links lookup failed:", error.message);
    return [];
  }
  return (data ?? []) as LinkSecretRow[];
}

/**
 * The secret of the repository, created and persisted if it does not already exist. Called at
 * POSE the hook — this is the value we write at GitLab.
 *
 * All the bindings in the repository receive the same value: they describe the
 * same hook. If one of them already has one, that one wins — en
 * generating a second would invalidate the neighbor's hook.
 */
export async function ensureRepoWebhookSecret(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<string> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  for (const link of links) {
    const existing = decryptForgeToken(link.webhook_secret_encrypted);
    if (existing) return existing;
  }
  return rotateRepoWebhookSecret(params);
}

/**
 * Forces a NEW secret on all bindings in the repository and returns it. The hook
 * at GitLab must be rewritten with it, otherwise nothing passes the check —
 * the caller is responsible for this order (secret first, hook later).
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
  /** Repository-specific secrets (one, in practice — the list covers a
 * partial rotation between two bindings in the same repository). */
  own: string[];
  /** The global fallback, when it is still deployed. */
  legacy: string | null;
  /** A connection by which we can rewrite the hook (rotation). */
  connectionId: string | null;
}

/** All the material for verifying a deposit, in one request. */
export async function loadWebhookSecrets(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<WebhookSecretCandidates> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  const own: string[] = [];
  for (const link of links) {
    const secret = decryptForgeToken(link.webhook_secret_encrypted);
    if (secret && !own.includes(secret)) own.push(secret);
  }
  return {
    own,
    legacy: legacyGitlabWebhookSecret(),
    connectionId: links[0]?.connection_id ?? null,
  };
}

/** Verification verdict: how was the token recognized? */
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
