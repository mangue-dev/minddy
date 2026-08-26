import { NextResponse, type NextRequest } from "next/server";

import { isManagedForgeEnabled } from "@/lib/managed-services";
import { verifyRelayRequest } from "@/lib/server/forge-relay/protocol";
import { parseRelayJsonObject } from "@/lib/server/forge-relay/json-body";
import {
  applyRelayLinkSync,
  parseRelayLinkSyncPayload,
} from "@/lib/server/forge-relay/link-sync";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * `POST /relay/links` — the instance pushes link/unlink events and periodic
 * reconciliation snapshots of its `project_git_links` to the control-plane
 * mirror (docs/managed-forge-relay-plan.md, "Link lifecycle sync"). The mirror
 * is the authorization check for token minting, so this channel is what keeps
 * it current after the claim.
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
  const parsed = parseRelayLinkSyncPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await applyRelayLinkSync({
    instanceId: verification.instance.id,
    generation: verification.timestamp,
    payload: parsed.payload,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  await getServiceClient().from("forge_relay_audit").insert({
    instance_id: verification.instance.id,
    action: "links_sync",
    detail: { applied: result.applied },
  });
  return NextResponse.json({ ok: true, applied: result.applied });
}
