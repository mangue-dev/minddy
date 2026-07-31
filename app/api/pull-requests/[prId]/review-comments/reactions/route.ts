import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  parseReactionPayload,
  setPrReviewCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Réactions emoji d'un commentaire de review (MIN-139).
 *
 * Route à part, et non un verbe de plus sur `../review-comments` : la cible n'est
 * pas la même — un COMMENTAIRE, pas le fil ni la liste. Les réactions se LISENT,
 * elles, avec les commentaires (le GET voisin les sert dans `reactions`) : un fil
 * se rend d'un bloc, et deux requêtes pour l'afficher se désynchroniseraient.
 *
 *  POST → { comment_id, content, on }   pose (`on: true`) ou retire la réaction
 */

type RouteContext = { params: Promise<{ prId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseReactionPayload(raw);
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrReviewCommentReactionResponse(auth.scope, parsed.payload);
}
