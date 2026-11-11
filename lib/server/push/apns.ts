import "server-only";

import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";

import type { PushPayload } from "./payload";

const TOKEN_MAX_AGE_MS = 50 * 60 * 1000;

export interface ApnsResponse {
  status: number;
  reason: string | null;
}

/** The app a token belongs to: each has its own bundle identifier (topic). */
export type ApnsPlatform = "ios" | "macos";
/** The gateway a token belongs to: development builds use the sandbox. */
export type ApnsEnvironment = "production" | "sandbox";

/**
 * Where a device receives its notifications, as recorded with its token
 * (`push_subscriptions.apns_platform` and `apns_environment`). A row without
 * them predates the iOS app: the macOS app in production.
 */
export interface ApnsTarget {
  platform: ApnsPlatform;
  environment: ApnsEnvironment;
}

export const LEGACY_APNS_TARGET: ApnsTarget = { platform: "macos", environment: "production" };

export function apnsTarget(platform: unknown, environment: unknown): ApnsTarget {
  return {
    platform: platform === "ios" ? "ios" : "macos",
    environment: environment === "sandbox" ? "sandbox" : "production",
  };
}

const APNS_ORIGINS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

/**
 * The `apns-topic` of each app. The key is team-scoped, so one key serves
 * both: `APNS_BUNDLE_ID` names the macOS app, `APNS_IOS_BUNDLE_ID` the iOS
 * app, `app.minddy.ios` unless set.
 */
export function apnsBundleId(platform: ApnsPlatform = "macos"): string {
  if (platform === "ios") return process.env.APNS_IOS_BUNDLE_ID?.trim() || "app.minddy.ios";
  return process.env.APNS_BUNDLE_ID?.trim() || "";
}

export function isApnsConfigured(): boolean {
  return !!(
    process.env.APNS_TEAM_ID?.trim() &&
    process.env.APNS_KEY_ID?.trim() &&
    process.env.APNS_PRIVATE_KEY?.trim() &&
    apnsBundleId()
  );
}

const base64url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

let cachedToken: { value: string; createdAt: number; identity: string } | null = null;

/** JWT ES256 provider, renewed well before the one-hour APNs limit. */
export function apnsProviderToken(now = Date.now()): string | null {
  if (!isApnsConfigured()) return null;
  const teamId = process.env.APNS_TEAM_ID!.trim();
  const keyId = process.env.APNS_KEY_ID!.trim();
  const rawKey = process.env.APNS_PRIVATE_KEY!.trim();
  const identity = `${teamId}:${keyId}:${rawKey}`;
  if (
    cachedToken &&
    cachedToken.identity === identity &&
    now - cachedToken.createdAt < TOKEN_MAX_AGE_MS
  ) {
    return cachedToken.value;
  }

  try {
    const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
    const claims = base64url(
      JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) })
    );
    const unsigned = `${header}.${claims}`;
    const key = createPrivateKey(rawKey.replace(/\\n/g, "\n"));
    const signature = sign("sha256", Buffer.from(unsigned), {
      key,
      dsaEncoding: "ieee-p1363",
    });
    const value = `${unsigned}.${base64url(signature)}`;
    cachedToken = { value, createdAt: now, identity };
    return value;
  } catch {
    console.error("[push/apns] private_key_refused");
    return null;
  }
}

/** An isolated HTTP/2 POST. The appellant's contract remains "never throw." */
export async function sendApnsNotification(
  endpoint: string,
  payload: PushPayload,
  target: ApnsTarget = LEGACY_APNS_TARGET,
): Promise<ApnsResponse> {
  const providerToken = apnsProviderToken();
  if (!providerToken) return { status: 0, reason: "NotConfigured" };
  const deviceToken = endpoint.startsWith("apns:") ? endpoint.slice(5) : endpoint;
  const topic = apnsBundleId(target.platform);
  if (!topic) return { status: 0, reason: "NotConfigured" };
  const expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    url: payload.url,
  });

  try {
    return await new Promise((resolve) => {
      const client = connect(APNS_ORIGINS[target.environment]);
      let settled = false;
      const finish = (response: ApnsResponse) => {
        if (settled) return;
        settled = true;
        client.destroy();
        resolve(response);
      };
      client.once("error", () => {
        console.error("[push/apns] connection_failed");
        finish({ status: 0, reason: "ConnectionFailed" });
      });

      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(expiration),
        ...(payload.tag ? { "apns-collapse-id": payload.tag.slice(0, 64) } : {}),
      });
      let status = 0;
      let responseBody = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk) => {
        responseBody += chunk;
      });
      request.on("end", () => {
        let reason: string | null = null;
        try {
          const parsed = JSON.parse(responseBody) as { reason?: unknown };
          if (typeof parsed.reason === "string") reason = parsed.reason;
        } catch {
          // A 200 response is empty; a non-JSON body adds nothing to the status.
        }
        finish({ status, reason });
      });
      request.on("error", () => {
        console.error("[push/apns] request_failed");
        finish({ status: 0, reason: "RequestFailed" });
      });
      request.setTimeout(10_000, () => {
        console.error("[push/apns] request_timeout");
        finish({ status: 0, reason: "Timeout" });
      });
      request.end(body);
    });
  } catch {
    // `connect` or `request` can also raise synchronously (header or
    // invalid local configuration). The push never goes back to the action which
    // created the inbox notification.
    console.error("[push/apns] request_setup_failed");
    return { status: 0, reason: "RequestSetupFailed" };
  }
}
