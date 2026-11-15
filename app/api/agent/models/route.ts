import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";
import { capability } from "@/lib/server/capabilities";

/**
 * Model catalog of the account's active provider (MIN-46). Resolution,
 * listing and cache live in `lib/server/agent/models-catalog.ts`; this route is
 * its authenticated HTTP front.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const catalog = await getAgentModelsForUser(auth.user.id);
  return NextResponse.json({
    ...catalog,
    routineSchedulingConfigured: capability("scheduler").configured,
  });
}
