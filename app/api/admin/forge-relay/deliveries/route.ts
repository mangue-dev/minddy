import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { isManagedForgeEnabled } from "@/lib/managed-services";
import { listRelayDeliveries } from "@/lib/server/forge-relay/fanout";

/**
 * Per-instance delivery dashboard for the webhook fan-out (admin): status,
 * attempts, and last error of recent deliveries — the operational view the
 * plan requires alongside retry and dead-letter.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const instanceId = request.nextUrl.searchParams.get("instance") ?? undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  return NextResponse.json({
    deliveries: await listRelayDeliveries({ instanceId, limit }),
  });
}
