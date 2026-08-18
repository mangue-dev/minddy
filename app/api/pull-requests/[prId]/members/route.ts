import type { NextRequest } from "next/server";

import { authorizePrRequest, prMembersResponse } from "@/lib/server/agent/pr-actions";

/**
 * GET /api/pull-requests/[prId]/members — the forge accounts we can
 * mention on this PR (MIN-162).
 *
 * EXCEPT from the detail, and loaded on demand (at the first `@` typed): open a
 * PR should not cost an extra round trip for a list that we don't care about.
 * only useful if you write.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prMembersResponse(auth.scope);
}
