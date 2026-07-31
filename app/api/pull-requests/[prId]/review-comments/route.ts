import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  createPrReviewCommentResponse,
  parseReviewCommentPayload,
  parseReviewThreadPayload,
  prReviewCommentsResponse,
  setPrReviewThreadResolvedResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Commentaires de review d'une pull request (MIN-143) — ceux ancrés à une ligne
 * du diff, par opposition au fil plat de `/comments`. Ce sont de VRAIS
 * commentaires de la forge : ils apparaissent sur la PR, et Numo les relit.
 *  GET   → { comments, threads } — les commentaires et l'état de leurs fils.
 *  POST  → { body, path, line, side }  poste sur une ligne
 *        | { body, in_reply_to }       répond dans un fil
 *  PATCH → { thread_id, resolved }     résout / rouvre un fil (MIN-139)
 *
 * Un commentaire part IMMÉDIATEMENT (équivalent « Add single comment ») : pas de
 * review groupée, pas de brouillon.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prReviewCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewCommentPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return createPrReviewCommentResponse(auth.scope, parsed.payload);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReviewThreadPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrReviewThreadResolvedResponse(auth.scope, parsed.payload);
}
