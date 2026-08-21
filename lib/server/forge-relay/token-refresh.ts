import "server-only";

import { relayRequest } from "./client";

/**
 * Instance side of the relay-brokered OAuth token refresh
 * (docs/managed-forge-relay-plan.md). Refresh grants need the OAuth app's
 * client credentials, which relayed instances deliberately do not hold —
 * when a brokered token set nears expiry, its refresh token is presented over
 * the signed channel and Cloud runs the grant with the managed apps'
 * credentials. Lineage is checked Cloud-side: only tokens Cloud delivered to
 * this instance are refreshable through it.
 */

interface BrokeredRefreshResponse {
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  scope?: string | null;
}

async function requestBrokeredRefresh(
  path: string,
  refreshToken: string,
): Promise<BrokeredRefreshResponse> {
  const response = await relayRequest<BrokeredRefreshResponse>(path, { refreshToken });
  if (!response.ok || !response.data?.accessToken) {
    throw new Error(response.error || "Relayed token refresh failed");
  }
  return response.data;
}

export interface RelayedGitlabTokenSet {
  accessToken: string;
  /** GitLab always rotates: a refresh grant without a new refresh token is unusable. */
  refreshToken: string;
  expiresAt: string | null;
  scope: string | null;
}

export async function refreshGitlabTokensViaRelay(
  refreshToken: string,
): Promise<RelayedGitlabTokenSet> {
  const data = await requestBrokeredRefresh("/api/relay/gitlab/refresh", refreshToken);
  if (!data.refreshToken) {
    throw new Error("Relayed GitLab refresh returned no refresh token");
  }
  return {
    accessToken: data.accessToken as string,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt ?? null,
    scope: data.scope ?? null,
  };
}

export interface RelayedGithubUserTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

export async function refreshGithubUserTokensViaRelay(
  refreshToken: string,
): Promise<RelayedGithubUserTokenSet> {
  const data = await requestBrokeredRefresh("/api/relay/github/user-refresh", refreshToken);
  return {
    accessToken: data.accessToken as string,
    refreshToken: data.refreshToken ?? null,
    expiresAt: data.expiresAt ?? null,
    scope: data.scope ?? null,
  };
}
