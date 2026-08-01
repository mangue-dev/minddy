import { NextResponse, type NextRequest } from "next/server";

import { authorizeRunPrRequest, prMembersResponse } from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-162) des comptes mentionnables — la route par PR est
 * `/api/pull-requests/[prId]/members`. Elle existe pour que le composer de
 * commentaire de LIGNE soit le même dans la vue diff d'une session d'agent que
 * dans le panneau PR : les deux vues ne connaissent qu'une `PrEndpoint`.
 *
 * Run sans PR → liste vide, comme les autres façades : il n'y a pas de dépôt
 * dont lire les collaborateurs, et ce n'est pas une erreur.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) {
    if ("noPr" in auth) return NextResponse.json({ members: [] });
    return auth.response;
  }
  return prMembersResponse(auth.scope);
}
