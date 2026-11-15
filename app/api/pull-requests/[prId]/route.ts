import type { NextRequest } from "next/server";

import { authorizePrRequest } from "@/lib/server/agent/pr-access";
import { prActionResponse } from "@/lib/server/agent/pr-actions";
import { prDetailResponse } from "@/lib/server/agent/pr-detail";

/**
 * In-app review of a pull request, addressed by the PR (MIN-143).
 * GET → PR metadata, files and patches, CI checks, approvals, merge policy
 * and what the viewer may do.
 * POST → `{ action, ... }`, one of `PR_ACTIONS` (`lib/pull-request-contract`).
 *
 * `lib/server/agent/pr-actions` dispatches each gesture to its domain module; this route only routes.
 */

type RouteContext = { params: Promise<{ prId: string }> };

// Merge message generation may continue after the response.
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId, "read");
  if (!auth.ok) return auth.response;
  return prDetailResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  return prActionResponse(request, prId);
}
