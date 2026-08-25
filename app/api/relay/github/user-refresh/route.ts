import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import {
  verifyRelayRequest,
  type RelayInstanceIdentity,
} from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { brokerTokenRefresh } from "@/lib/server/forge-relay/refresh-broker";
import { readBoundedRequestBody } from "@/lib/server/forge-relay/request-body";

export const RELAY_REFRESH_MAX_BODY_BYTES = 8 * 1024;

/**
 * `POST /relay/github/user-refresh` — relay-brokered refresh of a
 * user-to-server token (docs/managed-forge-relay-plan.md). The 8h user tokens
 * only refresh with the app's client credentials, which relayed instances do
 * not hold; they present the refresh token over the signed channel and Cloud
 * runs the grant. Only tokens Cloud delivered to THIS instance are honored
 * (lineage check, fail-closed).
 */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }

  const incoming = await readBoundedRequestBody(request, RELAY_REFRESH_MAX_BODY_BYTES);
  if (!incoming.ok) {
    return NextResponse.json({ error: "Relay request body is too large" }, { status: 413 });
  }
  const rawBody = incoming.body;
  const verification = await verifyRelayRequest({
    method: request.method,
    path: new URL(request.url).pathname,
    headers: request.headers,
    rawBody,
  });
  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: verification.status });
  }
  const instance: RelayInstanceIdentity = verification.instance;

  // A malformed body from an authenticated instance is a 400, not a 500.
  const body = parseRelayJsonObject(rawBody) as { refreshToken?: unknown } | null;
  const refreshToken = body?.refreshToken;
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length < 16 ||
    refreshToken.length > 4096
  ) {
    return NextResponse.json({ error: "Invalid refreshToken" }, { status: 400 });
  }

  const result = await brokerTokenRefresh({
    instanceId: instance.id,
    provider: "github",
    refreshToken,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    expiresAt: result.tokens.expiresAt,
    scope: result.tokens.scope,
  });
}
