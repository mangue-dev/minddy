import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { consumeRelayClaim, isValidClaimCode } from "@/lib/server/forge-relay/claims";

/**
 * `POST /api/relay/github/claim-result` — the instance polls the outcome of
 * its installation claim over the signed relay channel. Reads are idempotent
 * for the claiming instance (retry-friendly); the first successful read marks
 * the claim consumed on the Cloud side.
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
  const code = typeof body.code === "string" ? body.code : null;
  if (!isValidClaimCode(code)) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 400 });
  }

  const result = await consumeRelayClaim({
    instanceId: verification.instance.id,
    code,
  });
  return NextResponse.json(result);
}
