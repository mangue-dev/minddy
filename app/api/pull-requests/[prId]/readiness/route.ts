import type { NextRequest } from "next/server";

import {
  authorizePrRequest,
  prReadinessResponse,
} from "@/lib/server/agent/pr-actions";

type RouteContext = { params: Promise<{ prId: string }> };

/** Compact merge-readiness data for pull request list rows. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prReadinessResponse(auth.scope);
}
