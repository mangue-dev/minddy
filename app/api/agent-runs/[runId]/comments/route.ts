import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  createPrCommentResponse,
  prCommentsResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-143) du fil de conversation d'une PR : la route par PR est
 * `/api/pull-requests/[prId]/comments`. Celle-ci résout le run → sa PR et
 * délègue — gardée pour les deep-links `?run=` et la page `/agents`.
 *
 *  GET  → commentaires de la PR (`{ comments: [] }` si le run n'en a pas).
 *  POST → { body } ajoute un commentaire.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    if ("noPr" in auth) return NextResponse.json({ comments: [] });
    return auth.response;
  }
  return prCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let payload: { body?: string };
  try {
    payload = (await request.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.` : un corps JSON `null` est valide côté parseur mais n'a pas de champs.
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return createPrCommentResponse(auth.scope, body);
}
