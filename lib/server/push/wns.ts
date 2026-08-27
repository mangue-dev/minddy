import "server-only";

import { nativePushTarget } from "@/lib/desktop/native-push";
import type { PushPayload } from "./payload";

const TOKEN_SCOPE = "https://wns.windows.com/.default";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export interface WnsResponse {
  status: number;
  reason: string | null;
}

interface CachedToken {
  value: string;
  expiresAt: number;
  identity: string;
}

let cachedToken: CachedToken | null = null;

export function isWnsConfigured(): boolean {
  return !!(
    process.env.WNS_TENANT_ID?.trim() &&
    process.env.WNS_APP_ID?.trim() &&
    process.env.WNS_CLIENT_SECRET?.trim()
  );
}

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** Creates a cloud-sourced adaptive toast whose click uses the existing protocol path. */
export function wnsToastXml(payload: PushPayload): string {
  const target = nativePushTarget(payload.url) ?? "/inbox";
  const launch = `minddy://open?next=${encodeURIComponent(target)}`;
  return (
    `<toast launch="${escapeXml(launch)}" activationType="protocol">` +
    `<visual><binding template="ToastGeneric">` +
    `<text>${escapeXml(payload.title)}</text>` +
    `<text>${escapeXml(payload.body)}</text>` +
    `</binding></visual></toast>`
  );
}

function tokenIdentity(): string {
  return [
    process.env.WNS_TENANT_ID?.trim(),
    process.env.WNS_APP_ID?.trim(),
    process.env.WNS_CLIENT_SECRET?.trim(),
  ].join(":");
}

async function requestAccessToken(forceRefresh = false): Promise<string | null> {
  if (!isWnsConfigured()) return null;
  const identity = tokenIdentity();
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedToken?.identity === identity &&
    cachedToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now
  ) {
    return cachedToken.value;
  }

  const tenantId = process.env.WNS_TENANT_ID!.trim();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.WNS_APP_ID!.trim(),
    client_secret: process.env.WNS_CLIENT_SECRET!.trim(),
    scope: TOKEN_SCOPE,
  });
  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.error(`[push/wns] OAuth failed (${response.status})`);
      return null;
    }
    const data = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof data.access_token !== "string" || !data.access_token) return null;
    const expiresIn = Number(data.expires_in);
    cachedToken = {
      value: data.access_token,
      expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
      identity,
    };
    return cachedToken.value;
  } catch (error) {
    console.error("[push/wns] OAuth request failed:", (error as Error).message);
    return null;
  }
}

async function postToast(
  endpoint: string,
  payload: PushPayload,
  ttlSeconds: number,
  token: string,
): Promise<WnsResponse> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/xml",
        "X-WNS-Type": "wns/toast",
        "X-WNS-TTL": String(ttlSeconds),
        "X-WNS-RequestForStatus": "true",
      },
      body: wnsToastXml(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: response.status,
      reason:
        response.headers.get("x-wns-error-description") ??
        response.headers.get("x-wns-status"),
    };
  } catch (error) {
    return { status: 0, reason: (error as Error).message };
  }
}

/** Sends one toast and retries once with a fresh OAuth token after a 401. */
export async function sendWnsNotification(
  endpoint: string,
  payload: PushPayload,
  ttlSeconds = 24 * 60 * 60,
): Promise<WnsResponse> {
  const token = await requestAccessToken();
  if (!token) return { status: 0, reason: "NotConfigured" };
  const first = await postToast(endpoint, payload, ttlSeconds, token);
  if (first.status !== 401) return first;
  cachedToken = null;
  const freshToken = await requestAccessToken(true);
  return freshToken
    ? postToast(endpoint, payload, ttlSeconds, freshToken)
    : { status: 401, reason: first.reason ?? "Unauthorized" };
}

/** Test-only reset for module-level token reuse. */
export function resetWnsTokenCache(): void {
  cachedToken = null;
}
