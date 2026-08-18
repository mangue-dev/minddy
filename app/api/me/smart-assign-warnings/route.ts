import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { loadSmartAssignConfigWarnings } from "@/lib/server/smart-assign";
import type { SmartAssignWarningsResponse } from "@/lib/types";

/**
 * GET /api/me/smart-assign-warnings — my projects where Smart Assign runs without
 * be adjusted (MIN-31).
 *
 * A separate route and not a /api/me/summary field: the sidebar carries the
 * marks on ALL pages, while the dashboard summary reconciles
 * the cycle timeline and counts tickets — mount it anywhere for
 * pellet would amount to paying for the heaviest reading of the app each time
 * navigation. Here, two small `select`, and most often zero lines.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body: SmartAssignWarningsResponse = {
    warnings: await loadSmartAssignConfigWarnings(auth.user.id),
  };
  return NextResponse.json(body);
}
