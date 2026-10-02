import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { withPrivateNoStore } from "@/lib/server/private-response";
import { readBoundedRequestBody } from "@/lib/server/forge-relay/request-body";
import { LOCAL_SNAPSHOT_TTL, openLocalSnapshot, sealLocalSnapshot, type LocalSnapshotSlot, type SealedLocalSnapshot } from "@/lib/server/local-snapshots";

async function snapshotRequest(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const incoming = await readBoundedRequestBody(request, 8 * 1024 * 1024);
    if (!incoming.ok) return NextResponse.json({ error: "snapshot_too_large" }, { status: 413 });
    const body = JSON.parse(incoming.body);
    if (!body || !Object.hasOwn(LOCAL_SNAPSHOT_TTL, body.slot) || !["seal", "open"].includes(body.operation)) {
      return NextResponse.json({ error: "invalid_snapshot_request" }, { status: 400 });
    }
    const slot = body.slot as LocalSnapshotSlot;
    return body.operation === "seal"
      ? NextResponse.json({ snapshot: await sealLocalSnapshot(auth.user.id, slot, body.value, body.claimLegacy === true) })
      : NextResponse.json({ value: await openLocalSnapshot(auth.user.id, slot, body.snapshot as SealedLocalSnapshot) });
  } catch {
    return NextResponse.json({ error: "local_snapshot_unavailable" }, { status: 503 });
  }
}
export const POST = withPrivateNoStore(snapshotRequest);
