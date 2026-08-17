import "server-only";

import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";

import type { PushPayload } from "./payload";
import {
  isOfficialMinddyCloud,
  LEGACY_MINDDY_APNS_BUNDLE_ID,
} from "@/lib/deployment-profile";

const APNS_ORIGIN = "https://api.push.apple.com";
const TOKEN_MAX_AGE_MS = 50 * 60 * 1000;

export interface ApnsResponse {
  status: number;
  reason: string | null;
}

function apnsBundleId(): string {
  return process.env.APNS_BUNDLE_ID?.trim() ||
    (isOfficialMinddyCloud(process.env) ? LEGACY_MINDDY_APNS_BUNDLE_ID : "");
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

/** JWT ES256 provider, renouvelé bien avant la limite APNs d'une heure. */
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
  } catch (error) {
    console.error("[push/apns] clé privée refusée:", (error as Error).message);
    return null;
  }
}

/** Un POST HTTP/2 isolé. Le contrat de l'appelant reste « jamais de throw ». */
export async function sendApnsNotification(
  endpoint: string,
  payload: PushPayload
): Promise<ApnsResponse> {
  const providerToken = apnsProviderToken();
  if (!providerToken) return { status: 0, reason: "NotConfigured" };
  const deviceToken = endpoint.startsWith("apns:") ? endpoint.slice(5) : endpoint;
  const topic = apnsBundleId();
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
      const client = connect(APNS_ORIGIN);
      let settled = false;
      const finish = (response: ApnsResponse) => {
        if (settled) return;
        settled = true;
        client.destroy();
        resolve(response);
      };
      client.once("error", (error) => {
        console.error("[push/apns] connexion échouée:", error.message);
        finish({ status: 0, reason: error.message });
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
          // Une réponse 200 est vide ; un corps non JSON n'ajoute rien au statut.
        }
        finish({ status, reason });
      });
      request.on("error", (error) => {
        console.error("[push/apns] requête échouée:", error.message);
        finish({ status: 0, reason: error.message });
      });
      request.setTimeout(10_000, () => {
        console.error("[push/apns] délai de 10 s dépassé");
        finish({ status: 0, reason: "Timeout" });
      });
      request.end(body);
    });
  } catch (error) {
    // `connect` ou `request` peuvent aussi lever synchroniquement (en-tête ou
    // configuration locale invalide). Le push ne remonte jamais à l'action qui
    // a créé la notification d'inbox.
    console.error("[push/apns] préparation échouée:", (error as Error).message);
    return { status: 0, reason: (error as Error).message };
  }
}
