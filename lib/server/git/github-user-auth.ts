import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { requireCapability } from "@/lib/server/capabilities";
import { isForgeTokenCryptoConfigured } from "./token-crypto";
import { isForgeRelayClientConfigured } from "@/lib/server/forge-relay/client";

/**
 * GitHub App USER authorization (MIN-144) — user-to-server tokens, distinct
 * from installation tokens.
 *
 * An installation token acts as the App (`minddy-app[bot]`); a user-to-server
 * token acts on behalf of the PERSON, with the intersection of their rights
 * and those of the installation. This is required to approve a pull request
 * because minddy performs that action as the user on GitHub.
 *
 * We reuse the ALREADY INSTALLED App — we only add a client id /
 * secret and a *User authorization callback URL*. We do NOT activate “Request
 * user authorization (OAuth) during installation”: it would only authorize the
 * installer, while every member still needs to authorize their own account.
 * It would also replace the post-installation redirect and bypass
 * `/api/git/github/setup`, which completes repository connection setup.
 *
 * Refreshing after eight hours is available only when the App enables
 * “Expires user authorization tokens.” Otherwise the exchange returns neither
 * `expires_in` nor `refresh_token`, and the token is permanent; `expiresAt`
 * and `refreshToken` are then null, which is not a degraded state.
 */

const GITHUB_OAUTH_BASE = "https://github.com";

function getClientId(): string {
  const value = process.env.GITHUB_APP_CLIENT_ID;
  if (!value) throw new Error("Missing GITHUB_APP_CLIENT_ID");
  return value;
}

function getClientSecret(): string {
  const value = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!value) throw new Error("Missing GITHUB_APP_CLIENT_SECRET");
  return value;
}

/**
 * Is user authorization deployed? Distinct from
 * `isGithubAppConfigured()`: an installation can work very well (connection
 * deposit, agent) without the App carrying a client id — this is even the state before
 * MIN-144. The UI uses this to not offer a button that would respond 400.
 *
 * RELAYED instances have no local client id/secret, but the managed forge
 * relay brokers the OAuth dance for them — so a configured relay counts as
 * deployed too. Token encryption is required in both cases: the tokens are
 * stored instance-side either way.
 */
export function isGithubUserAuthConfigured(): boolean {
  if (!isForgeTokenCryptoConfigured()) return false;
  if (isForgeRelayClientConfigured()) return true;
  return isLocalGithubUserAuthConfigured();
}

/**
 * LOCAL user-authorization credentials only (operator-owned App + its client
 * id/secret), distinct from `isGithubUserAuthConfigured()` which also counts
 * the managed forge relay as deployed. The connect route uses this to hold
 * the documented precedence (docs/managed-forge-relay-plan.md): with a local
 * app configured, new authorizations stay local even when the relay is also
 * available.
 */
export function isLocalGithubUserAuthConfigured(): boolean {
  return Boolean(
    isForgeTokenCryptoConfigured() &&
      process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_SLUG?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim() &&
      process.env.GIT_STATE_SECRET?.trim() &&
      process.env.GITHUB_APP_CLIENT_ID?.trim() &&
      process.env.GITHUB_APP_CLIENT_SECRET?.trim(),
  );
}

/**
 * Authorization URL that minddy sends the user to. WITHOUT `scope`:
 * A GitHub App's permissions come from the App itself, not from the
 * request — requesting one would trigger the classic OAuth flow.
 */
export function getGithubUserAuthorizeUrl(opts: {
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${GITHUB_OAUTH_BASE}/login/oauth/authorize?${params.toString()}`;
}

export interface GithubUserTokenSet {
  accessToken: string;
  /** Absolute expiry (ISO), or null when the App does not expire its tokens. */
  expiresAt: string | null;
  /** Null when the App does not expire its tokens. */
  refreshToken: string | null;
  scope: string | null;
}

interface RawTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * POST github.com/login/oauth/access_token (form-encoded). Shared by exchange
 * and refresh it. GitHub responds in `application/x-www-form-urlencoded` with
 * default, including for errors: hence the `Accept: application/json`.
 */
async function requestUserToken(
  params: Record<string, string>,
  nowMs: number,
): Promise<GithubUserTokenSet> {
  requireCapability("github");
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    ...params,
  }).toString();
  const response = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as RawTokenResponse;
  // GitHub responds 200 with a body `{ error }` on outdated code: the status
  // is not enough to decide, the presence of the token is.
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `GitHub user token request failed (${response.status})`,
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(nowMs + data.expires_in * 1000).toISOString()
        : null,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope || null,
  };
}

/** Exchanges the `code` of the callback for a set of user tokens. */
export async function exchangeGithubUserCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<GithubUserTokenSet> {
  return requestUserToken(
    { code: opts.code, redirect_uri: opts.redirectUri },
    Date.now(),
  );
}

/** Refreshes a user-to-server token (lifespan 8 hours at GitHub). */
export async function refreshGithubUserToken(
  refreshToken: string,
): Promise<GithubUserTokenSet> {
  return requestUserToken(
    { refresh_token: refreshToken, grant_type: "refresh_token" },
    Date.now(),
  );
}

export interface GithubUserAccount {
  id: number;
  login: string;
  avatarUrl: string | null;
}

/** Identifies the authorized account (`GET /user` with the user token). */
export async function getGithubUserAccount(
  token: string,
): Promise<GithubUserAccount> {
  requireCapability("github");
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: githubHeaders(token),
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: number;
    login?: string;
    avatar_url?: string | null;
    message?: string;
  };
  if (!response.ok || typeof data.id !== "number") {
    throw new Error(data.message || `GitHub /user failed (${response.status})`);
  }
  return {
    id: data.id,
    login: data.login ?? "",
    avatarUrl: data.avatar_url ?? null,
  };
}

export interface GithubUserInstallationRepository {
  id: number;
  fullName: string;
}

/**
 * Returns one stable repository identity that the authorized user can access
 * through a specific installation. GitHub documents this user-scoped endpoint
 * as the setup-URL defense: a spoofed installation id cannot cross the user's
 * explicit installation access boundary.
 */
export async function getGithubUserInstallationRepository(
  token: string,
  installationId: number,
): Promise<GithubUserInstallationRepository | null> {
  requireCapability("github");
  const response = await fetch(
    `${GITHUB_API_BASE}/user/installations/${installationId}/repositories?per_page=1`,
    { headers: githubHeaders(token) },
  );
  const data = (await response.json().catch(() => ({}))) as {
    repositories?: Array<{ id?: number; full_name?: string }>;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      data.message || `GitHub user installation lookup failed (${response.status})`,
    );
  }
  const repository = data.repositories?.[0];
  if (
    !repository ||
    typeof repository.id !== "number" ||
    !Number.isSafeInteger(repository.id) ||
    typeof repository.full_name !== "string" ||
    !repository.full_name
  ) {
    return null;
  }
  return { id: repository.id, fullName: repository.full_name };
}
