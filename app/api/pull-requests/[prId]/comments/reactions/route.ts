import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  parseReactionPayload,
  setPrCommentReactionResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Réactions emoji du FIL de conversation (MIN-147) — le pendant exact de
 * `../../review-comments/reactions`, sur l'autre surface : sur GitHub, réagir
 * marche partout, et minddy ne le laissait faire que sur les commentaires ancrés
 * à une ligne de code.
 *
 * `comment_id: 0` vise le CORPS de la pull request (`PR_BODY_COMMENT_ID`), le
 * message qui ouvre le fil — d'où `allowBody`, que la route de review n'ouvre pas.
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
  const parsed = parseReactionPayload(raw, { allowBody: true });
  if (!parsed.ok) return parsed.response;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return setPrCommentReactionResponse(auth.scope, parsed.payload);
}
