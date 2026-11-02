import type { NextRequest } from "next/server";

import {
  authorizePrRequest,
  prDeploymentResponse,
} from "@/lib/server/agent/pr-actions";

type RouteContext = { params: Promise<{ prId: string }> };

/** Deployment card of a pull request, read after its detail (MIN-889). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prDeploymentResponse(auth.scope);
}
