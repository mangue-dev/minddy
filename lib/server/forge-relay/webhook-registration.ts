import "server-only";

import { isForgeRelayClientConfigured, relayRequest } from "./client";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * Instance-side registration of the webhook fan-out endpoint
 * (docs/managed-forge-relay-plan.md, "Webhook relay").
 *
 * The instance GENERATES the HMAC secret Cloud must use to sign fan-out
 * deliveries (`MINDDY_FORGE_RELAY_WEBHOOK_SECRET`) and pushes it — with its
 * webhook endpoint URL — over the authenticated channel. Rotation is the same
 * push; the instance accepts the old secret until Cloud's next delivery
 * carries the new one (both are verified during the overlap).
 *
 * Called once per server instance at startup (instrumentation) and available
 * for explicit re-registration.
 */

export function isRelayWebhookSecretConfigured(): boolean {
  const secret = process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET?.trim();
  return Boolean(secret && secret.length >= 32);
}

/** Registers (or rotates) the fan-out endpoint. Best-effort, never raises. */
export async function ensureRelayWebhookRegistration(): Promise<void> {
  if (!isForgeRelayClientConfigured() || !isRelayWebhookSecretConfigured()) return;
  try {
    const response = await relayRequest("/api/relay/webhook-secret", {
      webhookUrl: `${canonicalAppOrigin()}/api/webhooks/github`,
      secret: process.env.MINDDY_FORGE_RELAY_WEBHOOK_SECRET?.trim(),
    });
    if (!response.ok) {
      console.error("[forge-relay] webhook registration refused:", response.error);
    }
  } catch (err) {
    console.error("[forge-relay] webhook registration failed:", (err as Error).message);
  }
}
