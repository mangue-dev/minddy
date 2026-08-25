import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import {
  createPendingRelayClaim,
  isValidClaimCode,
} from "@/lib/server/forge-relay/claims";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";

/** Registers a one-time installation setup over the authenticated relay channel. */
export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json(
      { error: "Managed forge relay is not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const verification = await verifyRelayRequest({
    method: request.method,
    path: new URL(request.url).pathname,
    headers: request.headers,
    rawBody,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error },
      { status: verification.status },
    );
  }

  const body = parseRelayJsonObject(rawBody);
  const code = typeof body?.code === "string" ? body.code : null;
  if (!isValidClaimCode(code)) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 400 });
  }

  const created = await createPendingRelayClaim({
    instanceId: verification.instance.id,
    code,
  });
  if (!created.ok) {
    return NextResponse.json(
      { error: created.error },
      { status: created.status },
    );
  }
  return NextResponse.json({ ok: true });
}

