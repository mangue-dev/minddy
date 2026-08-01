import { type NextRequest } from "next/server";

import { authorizePrRequest, prCommitsResponse } from "@/lib/server/agent/pr-actions";

/**
 * Les commits qui composent une pull request, lus chez la forge avec un token
 * frais — l'onglet Commits du panneau PR.
 *  GET → { commits, truncated } (du plus ancien au plus récent).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitsResponse(auth.scope);
}
