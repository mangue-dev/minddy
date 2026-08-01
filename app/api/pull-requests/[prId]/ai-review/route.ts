import { type NextRequest } from "next/server";

import { authorizePrRequest, prReviewRunResponse } from "@/lib/server/agent/pr-actions";

/**
 * La review de Numo sur cette pull request, en tant que SESSION.
 *  GET → { review, events, reviewedHeadSha, defaultModel }
 *
 * Lu à l'ouverture du panneau (rejeu du fil), puis re-poll pendant qu'une passe
 * tourne — le direct realtime (`pr-review:{id}`) est le confort, ce GET est le
 * filet : onglet endormi, message perdu, page rechargée en plein milieu.
 *
 * Le déclenchement, lui, reste un POST sur la route parente
 * (`{ action: 'ai_review' }`) : c'est un geste sur la PR, pas sur sa session.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prReviewRunResponse(auth.scope, auth.userId);
}
