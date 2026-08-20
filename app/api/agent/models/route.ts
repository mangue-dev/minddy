import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";
import { capability } from "@/lib/server/capabilities";
import { resolveAgentExecutionBackend } from "@/lib/capabilities";

/**
 * Model index for agent picker (MIN-46), resolved according to provider
 * Account ASSET. The logic (resolution provider, listing, cache) lives in
 * `lib/server/agent/models-catalog.ts` — shared with the `list_agent_models` tool
 * by Numo. This route is now just an authenticated HTTP front.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const catalog = await getAgentModelsForUser(auth.user.id);
  return NextResponse.json({
    ...catalog,
    cloudExecutionConfigured: capability("agentExecution").configured,
    executionBackend: resolveAgentExecutionBackend(process.env),
    routineSchedulingConfigured: capability("scheduler").configured,
  });
}
