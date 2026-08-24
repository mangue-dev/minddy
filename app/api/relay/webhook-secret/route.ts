import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { encryptForgeToken } from "@/lib/server/git/token-crypto";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * `POST /api/relay/webhook-secret` — the instance registers its webhook
 * endpoint and signing secret over the authenticated channel. Cloud cannot
 * derive a shared secret (it only holds the instance's Ed25519 PUBLIC key),
 * so the INSTANCE generates the HMAC secret used for fan-out signatures — the
 * same direction as the GitLab per-repo hook secrets. Re-registration
 * (rotation) simply overwrites.
 */

/**
 * Cloud POSTs webhook payloads and signature headers to this URL. Registration
 * applies the same public-address policy as delivery so a target cannot be
 * persisted while it resolves to a private network or cloud metadata service.
 * Delivery resolves it again because DNS may change after registration.
 */
async function isAcceptableWebhookUrl(value: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  try {
    await assertPublicHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verification = await verifyRelayRequest({
    method: request.method,
    path: new URL(request.url).pathname,
    headers: request.headers,
    rawBody,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }

  // A malformed body from an authenticated instance is a 400, not a 500.
  const body = parseRelayJsonObject(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl : null;
  const acceptableWebhookUrl =
    webhookUrl !== null && (await isAcceptableWebhookUrl(webhookUrl));
  const secret =
    typeof body.secret === "string" && body.secret.length >= 32 ? body.secret : null;
  if (!webhookUrl || !acceptableWebhookUrl || !secret) {
    return NextResponse.json(
      {
        error:
          "webhookUrl must be an HTTPS URL resolving only to public addresses and secret (32+ characters) are required",
      },
      { status: 400 },
    );
  }

  const { error } = await getServiceClient()
    .from("forge_relay_instances")
    .update({
      webhook_url: webhookUrl,
      webhook_secret_encrypted: encryptForgeToken(secret),
    })
    .eq("id", verification.instance.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await getServiceClient().from("forge_relay_audit").insert({
    instance_id: verification.instance.id,
    action: "webhook_secret_registered",
    detail: { webhookUrl },
  });
  return NextResponse.json({ ok: true });
}
