import "server-only";

import crypto from "node:crypto";

/**
 * Cloud side of the relay-brokered OAuth token refresh
 * (docs/managed-forge-relay-plan.md).
 *
 * Refresh grants require the OAuth app's client credentials, which relayed
 * instances deliberately do not hold ("no long-lived forge secrets on
 * instances"). When a brokered token set nears expiry, the instance sends its
 * refresh token over the signed channel and Cloud runs the grant with the
 * managed apps' credentials.
 *
 * This module reads the client credentials DIRECTLY from the environment and
 * deliberately does not go through `gitlab-app.ts` / `github-user-auth.ts`:
 * those guard on the LOCAL app capability, which is absent on a Cloud
 * deployment that only operates the managed apps.
 */

const GITLAB_HOST = "https://gitlab.com";
const GITHUB_OAUTH_BASE = "https://github.com";

/** SHA-256 of a refresh token — the only form of it Cloud keeps at rest. */
export function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postTokenGrant(
  url: string,
  clientIdName: string,
  clientSecretName: string,
  params: Record<string, string>,
): Promise<RawTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv(clientIdName),
    client_secret: requireEnv(clientSecretName),
    ...params,
  }).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as RawTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `OAuth refresh failed (${response.status})`,
    );
  }
  return data;
}

/** Token set handed back to an instance after a brokered refresh. */
export interface BrokeredTokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry (ISO), or null when the provider does not expire tokens. */
  expiresAt: string | null;
  scope: string | null;
}

export async function refreshGitlabTokensWithManagedApp(
  refreshToken: string,
): Promise<BrokeredTokenSet> {
  const nowMs = Date.now();
  const data = await postTokenGrant(
    `${GITLAB_HOST}/oauth/token`,
    "GITLAB_OAUTH_CLIENT_ID",
    "GITLAB_OAUTH_CLIENT_SECRET",
    { refresh_token: refreshToken, grant_type: "refresh_token" },
  );
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token ?? null,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(nowMs + data.expires_in * 1000).toISOString()
        : null,
    scope: data.scope || null,
  };
}

export async function refreshGithubUserTokensWithManagedApp(
  refreshToken: string,
): Promise<BrokeredTokenSet> {
  const nowMs = Date.now();
  const data = await postTokenGrant(
    `${GITHUB_OAUTH_BASE}/login/oauth/access_token`,
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    { refresh_token: refreshToken, grant_type: "refresh_token" },
  );
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token ?? null,
    expiresAt:
      typeof data.expires_in === "number"
        ? new Date(nowMs + data.expires_in * 1000).toISOString()
        : null,
    scope: data.scope || null,
  };
}
