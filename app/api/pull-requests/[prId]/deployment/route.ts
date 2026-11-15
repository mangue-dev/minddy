import type { NextRequest } from "next/server";

import { authorizePrRequest } from "@/lib/server/agent/pr-access";
import { prDeploymentResponse } from "@/lib/server/agent/pr-detail";

type RouteContext = { params: Promise<{ prId: string }> };

/** Deployment card of a pull request, read after its detail (MIN-889). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId, "read");
  if (!auth.ok) return auth.response;
  return prDeploymentResponse(auth.scope);
}
