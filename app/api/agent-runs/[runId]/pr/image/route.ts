import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prCommentImageResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FACADE (MIN-162) of Comment Image Proxy — route through PR is
 * `/api/pull-requests/[prId]/image`. Without it, a capture stuck in a
 * line remark would remain broken in the diff view of an agent session,
 * while it is displayed in the PR panel: the same bug in two places.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const asset = request.nextUrl.searchParams.get("asset");
  if (!asset) return NextResponse.json({ error: "asset required" }, { status: 400 });

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return prCommentImageResponse(auth.scope, asset);
}
