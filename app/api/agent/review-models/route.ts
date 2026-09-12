import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";
import { capability } from "@/lib/server/capabilities";
import { resolveAgentExecutionBackend } from "@/lib/capabilities";

/**
 * Compatibility alias for older clients. PR reviews have no distinct model
 * resolution: this returns the same provider-bound account catalog as every
 * other code-worker surface.
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
  });
}
