import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  authenticateIntegration,
  publicApiError,
} from "@/lib/server/integration-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { ISSUE_PRIORITIES, ISSUE_EFFORTS } from "@/lib/issue-validation";

/**
 * GET /api/feedback/options — API publique (Bearer mdy_…). Expose les options
 * du projet pour que l'app externe mappe son propre UI de feedback :
 * catégories vivantes + enums priorité/effort.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateIntegration(request);
  if (!auth.ok) return auth.response;

  const rate = checkSessionRateLimit(auth.integration.id, "feedback:options");
  if (!rate.allowed) {
    return publicApiError(429, "rate_limited", "Too many requests.", {
      "Retry-After": String(rate.retryAfter),
    });
  }

  const service = getServiceClient();
  const { data: categories, error } = await service
    .from("categories")
    .select("id, name, color")
    .eq("project_id", auth.project.id)
    .order("name");

  if (error) {
    console.error("[api/feedback/options] list failed:", error.message);
    return publicApiError(500, "internal_error", "Something went wrong.");
  }

  return NextResponse.json({
    project: auth.project,
    categories: categories ?? [],
    priorities: ISSUE_PRIORITIES,
    efforts: ISSUE_EFFORTS,
  });
}
