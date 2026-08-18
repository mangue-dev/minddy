import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { GitIdentity } from "@/lib/types";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";
import {
  refreshGithubUserToken,
  type GithubUserTokenSet,
} from "./github-user-auth";

/**
 * The PERSONAL git account of a minddy user (MIN-144), table
 * `git_user_identities`. He is the one who signs human gestures on a sweater
 * request — where `git_connections` says “the App is installed on this account”.
 *
 * Customer service (RLS bypassed), user verification is done here in TS
 * (pattern `connections.ts`). The token columns NEVER come out: the
 * public functions select explicit columns, without the secrets.
 *
 * GitHub only for the moment: on the GitLab side, the OAuth connection of
 * `git_connections` IS already the identity of the person (see `forge-actor.ts`).
 */

/** Refresh when the token is within this expiry window. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Non-secret columns exposed to the UI. */
const PUBLIC_COLS = "id, provider, account_login, account_avatar_url, created_at";

interface PublicRow {
  id: string;
  provider: string;
  account_login: string | null;
  account_avatar_url: string | null;
  created_at: string;
}

function toPublic(row: PublicRow): GitIdentity {
  return {
    id: row.id,
    provider: row.provider as RepoProviderId,
    account_login: row.account_login,
    account_avatar_url: row.account_avatar_url,
    created_at: row.created_at,
    source: "identity",
  };
}

/**
 * All user's git accounts, sanitized — GitHub since
 * `git_user_identities`, GitLab depuis sa connexion OAuth de `git_connections`
 * (which IS already its identity: duplicating it would cause two rotations of
 * token). [] if none, null on DB error.
 */
export async function listUserIdentities(
  userId: string,
): Promise<GitIdentity[] | null> {
  const supabase = getServiceClient();
  const [identities, gitlab] = await Promise.all([
    supabase
      .from("git_user_identities")
      .select(PUBLIC_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("git_connections")
      .select("id, account_login, created_at")
      .eq("user_id", userId)
      .eq("provider", "gitlab")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (identities.error) return null;

  const rows = ((identities.data ?? []) as PublicRow[])
    // A possible GitLab line here would not be authoritative: the connection, yes.
    .filter((r) => r.provider !== "gitlab")
    .map(toPublic);
  const gitlabRow = gitlab.data as
    | { id: string; account_login: string | null; created_at: string }
    | null;
  if (gitlabRow) {
    rows.push({
      id: gitlabRow.id,
      provider: "gitlab",
      account_login: gitlabRow.account_login,
      account_avatar_url: null,
      created_at: gitlabRow.created_at,
      source: "connection",
    });
  }
  return rows;
}

/**
 * Registers (or replaces) the git account authorized by the user. Unique by
 * `(user_id, provider)`: reauthorizing another GitHub account replaces the
 * previous — it is indeed “MY git account”, in the singular.
 */
export async function upsertUserIdentity(params: {
  userId: string;
  provider: RepoProviderId;
  providerAccountId: string;
  accountLogin: string | null;
  accountAvatarUrl: string | null;
  tokens: GithubUserTokenSet;
}): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("git_user_identities")
    .upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        provider_account_id: params.providerAccountId,
        account_login: params.accountLogin,
        account_avatar_url: params.accountAvatarUrl,
        access_token_encrypted: encryptForgeToken(params.tokens.accessToken),
        refresh_token_encrypted: params.tokens.refreshToken
          ? encryptForgeToken(params.tokens.refreshToken)
          : null,
        token_expires_at: params.tokens.expiresAt,
        oauth_scopes: params.tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to store git user identity");
  }
  return data.id as string;
}

/**
 * Reset the account displayed on what the forge says about it today (MIN-154):
 * the login is a DISPLAY name, written at login and never refreshed
 * then — token rotation only affects tokens, and an App token does not
 * expiring never even triggers it.
 *
 * Targeted by `(user_id, provider)`, the unique upsert couple. Only write if
 * a value has moved: the settings page often reloads, and a `updated_at`
 * who advances without reason is the marker of nothing.
 */
export async function updateIdentityAccount(
  userId: string,
  provider: RepoProviderId,
  account: {
    providerAccountId: string;
    accountLogin: string | null;
    accountAvatarUrl: string | null;
  },
): Promise<void> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_user_identities")
    .select("provider_account_id, account_login, account_avatar_url")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  const row = data as {
    provider_account_id: string | null;
    account_login: string | null;
    account_avatar_url: string | null;
  } | null;
  if (!row) return;
  if (
    row.provider_account_id === account.providerAccountId &&
    row.account_login === account.accountLogin &&
    row.account_avatar_url === account.accountAvatarUrl
  ) {
    return;
  }
  await supabase
    .from("git_user_identities")
    .update({
      provider_account_id: account.providerAccountId,
      account_login: account.accountLogin,
      account_avatar_url: account.accountAvatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);
}

/**
 * Disconnects the git account from a provider. Returns false if the user does not
 * had none — actually calling it a 404.
 */
export async function deleteUserIdentity(
  userId: string,
  identityId: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_user_identities")
    .delete()
    .eq("id", identityId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  return !!data;
}

interface TokenRow {
  id: string;
  account_login: string | null;
  account_avatar_url: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

async function loadTokenRow(
  userId: string,
  provider: RepoProviderId,
): Promise<TokenRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_user_identities")
    .select(
      "id, account_login, account_avatar_url, access_token_encrypted, " +
        "refresh_token_encrypted, token_expires_at",
    )
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as TokenRow | null) ?? null;
}

/** A user's GitHub account, including token fees. */
export interface GithubUserCredentials {
  token: string;
  login: string | null;
  avatarUrl: string | null;
}

/**
 * One rotation at a time per user, IN this process.
 *
 * The pull request panel pulls three to four requests IN PARALLEL
 * (detail, conversation, review comments, commits), and each resolves
 * the actor — so mint this token. When they fall together in the window
 * `REFRESH_SKEW_MS`, they all refresh, with the SAME refresh token.
 *
 * But GitHub invalidates the old access token on each rotation: two rotations
 * competitors leave the token of the first in the base (the compare-and-set plus
 * low only lets one winner be written) while the second has just killed him — a
 * dead token carrying a fresh-looking expiry, which nothing refreshes anymore
 * for eight hours. This is the failure mode observed on 2026-08-03: “your
 * git account cannot merge..." on screen, `Bad credentials` at first
 * geste.
 *
 * Promise sharing solves the dominant case (Fluid Compute reuses
 * the instance between competing requests). Between instances, it's probe 401
 * of `forge-actor.ts` which catches up, forcing a rotation.
 */
const inFlight = new Map<string, Promise<GithubUserCredentials | null>>();

/**
 * Valid user GitHub token, or **null** — never exception: none
 * connected account, an indecipherable envelope (turned secret) and a refresh
 * dead all say “reconnect your account” upstream, not 500.
 *
 * Two worlds depending on the configuration of the App:
 * • “Expire user authorization tokens” ENABLED → expiry at 8 a.m. + refresh token,
 * refreshed lazily under `REFRESH_SKEW_MS`;
 * • disabled → `token_expires_at` null and NO refresh token: the token is
 * permanent, we decipher it and return it as it is.
 *
 * `force` skips the “not yet expired” shortcut: this is what a
 * caller to whom GitHub has just responded 401 on this token. The stored expiry
 * then says something that the forge denies, and it is the forge that is right.
 *
 * Persistence in compare-and-set on `token_expires_at` (the refresh token of
 * GitHub is rotating single-use, like that of GitLab): the loser of a
 * race rereads the line and reuses the winner's token.
 */
export async function getGithubUserToken(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<GithubUserCredentials | null> {
  // A forced rotation is not grafted onto a pass in progress: it is
  // precisely the token that she was going to return which has just been refused.
  const shared = opts.force ? null : inFlight.get(userId);
  if (shared) return shared;
  const task = mintGithubUserToken(userId, !!opts.force).finally(() => {
    if (inFlight.get(userId) === task) inFlight.delete(userId);
  });
  inFlight.set(userId, task);
  return task;
}

async function mintGithubUserToken(
  userId: string,
  force: boolean,
): Promise<GithubUserCredentials | null> {
  const row = await loadTokenRow(userId, "github");
  if (!row) return null;
  const account = { login: row.account_login, avatarUrl: row.account_avatar_url };
  const withToken = (token: string | null) => (token ? { token, ...account } : null);

  // Permanent token: the App does not expire its authorizations. Nothing to force no
  // plus — il n'y a pas de refresh token en face.
  if (row.token_expires_at == null) {
    return withToken(decryptForgeToken(row.access_token_encrypted));
  }

  const nowMs = Date.now();
  if (!force && Date.parse(row.token_expires_at) - nowMs > REFRESH_SKEW_MS) {
    const token = decryptForgeToken(row.access_token_encrypted);
    if (token) return withToken(token);
    // Decryption failed (secret twisted / corruption) → we attempt a refresh.
  }

  const refreshToken = decryptForgeToken(row.refresh_token_encrypted);
  if (!refreshToken) return null;

  let refreshed: GithubUserTokenSet;
  try {
    refreshed = await refreshGithubUserToken(refreshToken);
  } catch (err) {
    // Single-use rotation race: another worker refreshed first. We
    // rereads; if the stored expiry has ADVANCED, its token is fresh — we take it back.
    const recovered = await loadTokenRow(userId, "github");
    if (
      recovered &&
      recovered.token_expires_at != null &&
      recovered.token_expires_at !== row.token_expires_at
    ) {
      const token = decryptForgeToken(recovered.access_token_encrypted);
      if (token) return withToken(token);
    }
    console.warn(
      `[user-identities] GitHub token refresh failed: ${(err as Error).message}`,
    );
    return null;
  }

  const supabase = getServiceClient();
  const persist = supabase
    .from("git_user_identities")
    .update({
      access_token_encrypted: encryptForgeToken(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptForgeToken(refreshed.refreshToken)
        : null,
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  // The compare-and-set no longer makes sense on a FORCED rotation: it leaves
  // precisely from a stored expiry that the forge denied, and it is our token
  // which is authentic. Without it, we only rewrite if no one has moved.
  const { data: written } = await (force
    ? persist
    : persist.eq("token_expires_at", row.token_expires_at)
  ).select("id");
  // Losing the compare-and-set is NOT trivial: the line keeps the token of
  // winner, which our own rotation may have just invalidated at GitHub.
  // It is said - it is the only trace which names this race, and the probe 401 of
  // `forge-actor.ts` is what catches her.
  if (!force && !written?.length) {
    console.warn(
      "[user-identities] concurrent GitHub token rotation: our refresh was not persisted",
    );
  }
  return { token: refreshed.accessToken, ...account };
}
