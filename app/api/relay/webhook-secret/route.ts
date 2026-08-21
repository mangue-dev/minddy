import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { encryptForgeToken } from "@/lib/server/git/token-crypto";
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
 * Cloud POSTS webhook payloads and signature headers to this URL, so
 * cleartext http is only tolerated for loopback hosts (local development) —
 * never for an arbitrary internet host. This bounds what a compromised
 * instance secret can point Cloud at (no http SSRF surface beyond loopback).
 */
function isAcceptableWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
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
  const webhookUrl =
    typeof body.webhookUrl === "string" && isAcceptableWebhookUrl(body.webhookUrl)
      ? body.webhookUrl
      : null;
  const secret =
    typeof body.secret === "string" && body.secret.length >= 32 ? body.secret : null;
  if (!webhookUrl || !secret) {
    return NextResponse.json(
      {
        error:
          "webhookUrl must be https (http only allowed for loopback hosts) and secret (32+ characters) are required",
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
