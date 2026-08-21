import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import {
  verifyRelayRequest,
  type RelayInstanceIdentity,
} from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import {
  mintRelayedInstallationToken,
  parseInstallationTokenMintPayload,
} from "@/lib/server/forge-relay/mint";

/**
 * `POST /relay/github/installation-token` — the control plane mints a
 * short-lived installation token for an authenticated instance
 * (docs/managed-forge-relay-plan.md, "Token minting"). The GitHub App private
 * key never leaves Cloud; the instance presents a signed request and receives
 * a token scoped to the requested repositories and permission profile.
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
  const instance: RelayInstanceIdentity = verification.instance;

  // A malformed body from an authenticated instance is a 400, not a 500.
  const body = parseRelayJsonObject(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseInstallationTokenMintPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const mint = await mintRelayedInstallationToken({
    instanceId: instance.id,
    payload: parsed.payload,
  });
  if (!mint.ok) {
    return NextResponse.json({ error: mint.error }, { status: mint.status });
  }
  return NextResponse.json({ token: mint.token, expiresAt: mint.expiresAt });
}
