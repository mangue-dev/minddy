"use client";

import { trackEvent } from "./analytics";

export interface OAuthGrant {
  id: string;
  client_id: string;
  client_name: string;
  /** Agent du registry deviné depuis le nom du client (logo) ; null = inconnu. */
  agent: string | null;
  scope: string;
  created_at: string;
  last_used_at: string | null;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchOAuthGrantsApi(): Promise<{ grants: OAuthGrant[] }> {
  return parseJson(await fetch("/api/account/oauth-grants"));
}

export async function revokeOAuthGrantApi(grantId: string): Promise<void> {
  trackEvent("oauth_grant_revoked", {});
  await parseJson(
    await fetch(`/api/account/oauth-grants/${encodeURIComponent(grantId)}`, {
      method: "DELETE",
    })
  );
}
