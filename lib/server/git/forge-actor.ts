import "server-only";

import { createHash } from "node:crypto";

import type { RepoProviderId } from "@/lib/repo-providers";
import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { GITLAB_API_BASE, gitlabHeaders } from "./gitlab-rest";
import { getGithubUserToken } from "./user-identities";
import { getGitlabAccessToken } from "./gitlab-app";
import { findReusableConnection } from "./connections";
import {
  githubCapabilityFromRepo,
  gitlabCapabilityFromProject,
  type RepoCapability,
} from "./repo-capability";

/**
 * THE ACTOR of a human gesture on a pull request (MIN-144): the token of the account
 * git of the connected user, plus what he has the right to do on this repository.
 *
 * This is the second holder of `PrScope`. The first one — `target.token`, token
 * GitHub or OAuth installation of the GitLab LINK — continues to be used for readings and everything Numo does: the agent IS minddy, it must remain the
 * bot. The dividing line is *human vs agent*, not *writing vs reading*.
 *
 * On the GitLab side, the actor corrects a real identity bug in passing:
 * `resolveRepoCloneTargetForRepo` takes the connection carried by the LINK of
 * project — that of which linked the repository. A member B therefore wrote under
 * the GitLab identity of member A. Here, it is HIS own connection, never that of the
 * link.
 */

export type ForgeActor =
  | {
      kind: "actor";
      token: string;
      login: string | null;
      avatarUrl: string | null;
      capability: RepoCapability;
    }
  | {
      kind: "none";
      /**
 * `noAccount` = nothing connected; `noRepoAccess` = 404; `expired` = a
 * account is well connected but the forge REFUSES its token (401).
 *
 * The three lead to different sentences, and confusing the last one with
 * something else is the worst of the three: that's what made minddy say
 * "your git account cannot merge this repository" to the owner of the
 * deposit (measured on 2026-08-03), before serving him a raw `Bad credentials`
 * at the first gesture.
 */
      reason: "noAccount" | "noRepoAccess" | "expired";
      login?: string | null;
    };

/**
 * In-process cache of the membership VERDICT, by (userId, provider, deposit).
 * Short TTL: the right of an account on a deposit rarely moves, but when it
 * moves, five minutes is the worst acceptable delay.
 *
 * It ONLY keeps the capability, never the token: the mint already has its own
 * cache (DB line on the GitHub side, lazy refresh on the GitLab side), and hiding a
 * token here would make it survive a disconnection.
 */
const CAPABILITY_TTL_MS = 5 * 60_000;
const capabilityCache = new Map<string, { capability: RepoCapability; at: number }>();

function cacheKey(userId: string, provider: RepoProviderId, repoFullName: string) {
  return `${userId}:${provider}:${repoFullName}`;
}

/**
 * Tokens that a forced rotation did NOTHING pull — the permission is to
 * redo, and nothing automatic will fix it.
 *
 * Without this guard, each of the three or four requests that a PR
 * panel pulls every fifteen seconds would replay the rotation, or around fifteen
 * failed OAuth exchanges per minute on an account already lost.
 *
 * Indexed by the FINGERPRINT of the token, not by the user: reauthorization changes the
 * token, therefore the fingerprint, therefore the guard rises by itself - where a TTL
 * would make someone who just repaired wait for their window to end. A
 * fingerprint is not a secret; the token is not written anywhere here.
 */
const deadTokens = new Set<string>();
const DEAD_TOKENS_MAX = 500;

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 22);
}

function rememberDeadToken(token: string): void {
  // Memory terminal: a long-lived process must not accumulate endlessly.
  // We start from scratch rather than finely evicting — the cost of forgetting is a
  // OAuth exchange again, not an error.
  if (deadTokens.size >= DEAD_TOKENS_MAX) deadTokens.clear();
  deadTokens.add(tokenFingerprint(token));
}

/** The login/avatar of the account, to say them in the UI without a second round trip. */
interface ActorAccount {
  token: string;
  login: string | null;
  avatarUrl: string | null;
}

/**
 * Mint of the token of THIS user's account, or null if he has not connected one
 * (or if the token is unrecoverable: secret turned, refresh dead - the caller
 * in fact "reconnect your account", never a 500).
 */
async function resolveAccount(
  userId: string,
  provider: RepoProviderId,
  /** Ignores the stored expiry and rotates the token: see `resolveForgeActor`. */
  force = false,
): Promise<ActorAccount | null> {
  if (provider === "github") return getGithubUserToken(userId, { force });

  const connection = await findReusableConnection(userId, "gitlab");
  if (!connection) return null;
  try {
    const token = await getGitlabAccessToken(connection.id, { force });
    return { token, login: connection.account_login, avatarUrl: null };
  } catch (err) {
    console.warn(
      `[forge-actor] GitLab token unavailable: ${(err as Error).message}`,
    );
    return null;
  }
}

/** `expired` = the forge refused the token itself (401), not the deposit. */
type CapabilityProbe =
  | { outcome: "capability"; capability: RepoCapability; cacheable: boolean }
  | { outcome: "expired" };

/**
 * Membership in the repository, seen by the user's account.
 *
 * Both forges respond **404** when the account does not see the repository (they
 * hide its existence): this is the only "not member" verdict, and the
 * alone that we cache.
 *
 * **401** does not talk about the deposit: it talks about the TOKEN. Reading it as a degraded right
 * — which is what falling back to `read` * did — produces the worst possible sentence,
 * "your account cannot merge this repository", addressed to someone who owns it; then a bare `Bad credentials` at the first gesture. A refused token
 * says "reconnect your account", and nothing else.
 *
 * The rest — 403 (API quota exhausted, organization SSO not validated), 5xx,
 * unreadable response — falls back to `read` WITHOUT cache: an outage or limit of
 * flow must not freeze for five minutes in “you are not a member”. The
 * writing gesture will fail with the true message from the forge.
 */
async function fetchCapability(
  provider: RepoProviderId,
  repoFullName: string,
  token: string,
): Promise<CapabilityProbe> {
  const response =
    provider === "github"
      ? await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}`, {
          headers: githubHeaders(token),
        })
      : await fetch(
          `${GITLAB_API_BASE}/projects/${encodeURIComponent(repoFullName)}`,
          { headers: gitlabHeaders(token) },
        );

  if (response.status === 401) return { outcome: "expired" };
  if (response.status === 404) {
    return { outcome: "capability", capability: "none", cacheable: true };
  }
  if (!response.ok) {
    return { outcome: "capability", capability: "read", cacheable: false };
  }

  const json = await response.json().catch(() => null);
  return {
    outcome: "capability",
    capability:
      provider === "github"
        ? githubCapabilityFromRepo(json)
        : gitlabCapabilityFromProject(json),
    cacheable: true,
  };
}

/**
 * Who acts, and to what extent. Never raises: any failure results in an explicit refusal
 * that the UI knows how to explain.
 */
export async function resolveForgeActor(opts: {
  userId: string;
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<ForgeActor> {
  let account = await resolveAccount(opts.userId, opts.provider);
  if (!account) return { kind: "none", reason: "noAccount" };

  // Token already found dead: neither probe nor rotation. BEFORE the cache
  // capability — a right stored three minutes ago does not return a token
  // usable, and returning it here would restart a gesture doomed to 401.
  if (deadTokens.has(tokenFingerprint(account.token))) {
    return { kind: "none", reason: "expired", login: account.login };
  }

  const key = cacheKey(opts.userId, opts.provider, opts.repoFullName);
  const cached = capabilityCache.get(key);
  if (cached && Date.now() - cached.at < CAPABILITY_TTL_MS) {
    return cached.capability === "none"
      ? { kind: "none", reason: "noRepoAccess", login: account.login }
      : { kind: "actor", ...account, capability: cached.capability };
  }

  const probe = async (token: string): Promise<CapabilityProbe | null> => {
    try {
      return await fetchCapability(opts.provider, opts.repoFullName, token);
    } catch (err) {
      // Dead network: we neither claim that it has the right nor that it does not have it.
      // Without cache, the next attempt will retry — and the writing will
      // will fail with the forge message.
      console.warn(`[forge-actor] capability probe failed: ${(err as Error).message}`);
      return null;
    }
  };

  let probed = await probe(account.token);
  if (!probed) return { kind: "actor", ...account, capability: "read" };

  // Token refused: the stored expiry lied. A forced rotation catches the case
  // where a race left it in base behind a token already invalidated by
  // GitHub — this is the outage that cost the user eight hours of writing time,
  // and it repairs itself here without him having to do anything. Only one attempt: if
  // the refresh token is also dead, the authorization is indeed up
  // redo, and that's what we say.
  if (probed.outcome === "expired") {
    const rotated = await resolveAccount(opts.userId, opts.provider, true);
    if (!rotated || rotated.token === account.token) {
      rememberDeadToken(account.token);
      return { kind: "none", reason: "expired", login: account.login };
    }
    account = rotated;
    probed = await probe(account.token);
    if (!probed) return { kind: "actor", ...account, capability: "read" };
    if (probed.outcome === "expired") {
      rememberDeadToken(account.token);
      return { kind: "none", reason: "expired", login: account.login };
    }
  }

  if (probed.cacheable) {
    capabilityCache.set(key, { capability: probed.capability, at: Date.now() });
  }
  if (probed.capability === "none") {
    return { kind: "none", reason: "noRepoAccess", login: account.login };
  }
  return { kind: "actor", ...account, capability: probed.capability };
}
