import { NextResponse, type NextRequest } from "next/server";

import { authorizeRunPrRequest, prMembersResponse } from "@/lib/server/agent/pr-actions";

/**
 * FACADE (MIN-162) of mentionable accounts — the route by PR is
 * `/api/pull-requests/[prId]/members`. It exists so that the composition of
 * LINE comment is the same in the diff view of an agent session as
 * in the PR panel: both views only know one `PrEndpoint`.
 *
 * Run without PR → empty list, like the other facades: there is no repository
 * whose collaborators read, and this is not an error.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    if ("noPr" in auth) return NextResponse.json({ members: [] });
    return auth.response;
  }
  return prMembersResponse(auth.scope);
}
