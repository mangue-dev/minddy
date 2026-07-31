import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest, prFileSourceResponse } from "@/lib/server/agent/pr-actions";

/**
 * Version BASE d'un fichier du diff d'une pull request (MIN-143) — la source
 * dont la vue diff a besoin pour déplier le contexte masqué autour des hunks.
 *  GET ?path=… → { content } (texte brut du fichier au merge base).
 *
 * Appelée à la demande, au premier dépliage d'un fichier : ouvrir un diff n'en
 * déclenche aucune. Le chemin demandé est validé contre les fichiers de CE diff
 * — sinon la route donnerait à lire n'importe quel fichier du dépôt.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prFileSourceResponse(auth.scope, path);
}
