import "server-only";

import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { capability, requireCapability } from "@/lib/server/capabilities";
import { isForgeTokenCryptoConfigured } from "./token-crypto";
import { isForgeRelayClientConfigured } from "@/lib/server/forge-relay/client";

/**
 * GitHub App USER authorization (MIN-144) — tokens
 * *user-to-server*, distincts du token d'installation.
 *
 * Un token d'installation parle au nom de l'App (`minddy-app[bot]`) ; un token
 * user-to-server speaks on behalf of the PERSON, with the intersection of their rights
 * and those of the installation. This is what it takes to approve a PR
 * since minddy really checks the green box on GitHub.
 *
 * We reuse the ALREADY INSTALLED App — we only add a client id /
 * secret and a *User authorization callback URL*. We do NOT activate “Request
 * user authorization (OAuth) during installation”: it would only authorize the
 * person who installs (and each member must authorize THEIR account, so the
 * explicit button remains necessary anyway) and it would change the
 * post-installation redirect, so `/api/git/github/setup` — the only path
 * depot link that works.
 *
 * Trap: the refresh at 8 a.m. ONLY exists if the App has “Expires user authorization
 * tokens” enabled. Otherwise the exchange returns neither `expires_in` nor
 * `refresh_token`, and the token is PERMANENT — `expiresAt` and `refreshToken`
 * are then null, which is not a degraded state.
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
  return !!(
    capability("github").configured &&
    process.env.GITHUB_APP_CLIENT_ID &&
    process.env.GITHUB_APP_CLIENT_SECRET
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
  /** Expiry absolu (ISO), ou null quand l'App n'expire pas ses tokens. */
  expiresAt: string | null;
  /** Absent (null) quand l'App n'expire pas ses tokens. */
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
