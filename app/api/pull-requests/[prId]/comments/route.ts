import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";

import {
  authorizePrRequest,
  createPrCommentResponse,
  prCommentsResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Fil de conversation d'une pull request (MIN-143), servi par l'API de la forge
 * via un token frais.
 *  GET  → commentaires de la PR.
 *  POST → { body } ajoute un commentaire (auteur = la GitHub App minddy, ou le
 *         compte GitLab connecté).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommentsResponse(auth.scope);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let payload: { body?: string; replyTo?: unknown };
  try {
    payload = (await request.json()) as { body?: string; replyTo?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.` : un corps JSON `null` est valide côté parseur mais n'a pas de champs.
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  // `replyTo` ne désigne QUE du contexte pour Numo : il ne pilote aucune écriture
  // chez la forge, qui n'a pas de fil sur cette surface. Un id qui ne correspond
  // à rien se résout simplement en « aucun message cité » (cf. la passe), il n'y
  // a donc rien à refuser ici au-delà de la forme. `0` est le corps de la PR.
  const replyTo =
    typeof payload?.replyTo === "number" && Number.isInteger(payload.replyTo)
      ? payload.replyTo
      : null;

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return createPrCommentResponse(auth.scope, body, auth.userId, await getLocale(), replyTo);
}
