import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prCommentImageResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-162) du proxy d'image de commentaire — la route par PR est
 * `/api/pull-requests/[prId]/image`. Sans elle, une capture collée dans une
 * remarque de ligne resterait cassée dans la vue diff d'une session d'agent,
 * alors qu'elle s'affiche dans le panneau PR : le même bug à deux endroits.
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
