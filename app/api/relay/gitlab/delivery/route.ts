import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { consumeGitlabTokenDelivery } from "@/lib/server/forge-relay/gitlab-broker";

/**
 * `POST /api/relay/gitlab/delivery` — the instance fetches a brokered GitLab
 * token pair over the signed relay channel. Single consumption, idempotent
 * reads for the owning instance; refreshes then happen instance-side and
 * Cloud never sees the token again.
 */
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
  const deliveryId =
    typeof body.deliveryId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.deliveryId)
      ? body.deliveryId
      : null;
  if (!deliveryId) {
    return NextResponse.json({ error: "Invalid delivery id" }, { status: 400 });
  }

  const result = await consumeGitlabTokenDelivery({
    instanceId: verification.instance.id,
    deliveryId,
  });
  return NextResponse.json(result);
}
