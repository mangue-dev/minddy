import type { NextRequest } from "next/server";

import { authorizePrRequest, prMembersResponse } from "@/lib/server/agent/pr-actions";

/**
 * GET /api/pull-requests/[prId]/members — les comptes de la forge qu'on peut
 * mentionner sur cette PR (MIN-162).
 *
 * À PART du détail, et chargée à la demande (au premier `@` tapé) : ouvrir une
 * PR ne doit pas coûter un aller-retour de plus pour une liste dont on ne se
 * sert que si l'on écrit.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prMembersResponse(auth.scope);
}
