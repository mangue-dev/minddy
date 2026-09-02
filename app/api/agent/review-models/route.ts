import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPrReviewModelCatalog } from "@/lib/server/agent/models-catalog";
import { capability } from "@/lib/server/capabilities";
import { resolveAgentExecutionBackend } from "@/lib/capabilities";

/**
 * The PR review picker follows the account's active execution provider. Native
 * BYOK providers therefore receive native model IDs, while platform runs keep
 * the filtered OpenRouter catalog and the account's plan ceiling.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const catalog = await getPrReviewModelCatalog(auth.user.id);
  return NextResponse.json({
    ...catalog,
    cloudExecutionConfigured: capability("agentExecution").configured,
    executionBackend: resolveAgentExecutionBackend(process.env),
  });
}
