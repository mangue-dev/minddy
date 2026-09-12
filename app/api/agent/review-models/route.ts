import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";

/**
 * Compatibility alias for older clients. PR reviews have no distinct model
 * resolution: this returns the same provider-bound account catalog as every
 * other code-worker surface.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const catalog = await getAgentModelsForUser(auth.user.id);
  return NextResponse.json(catalog);
}
