import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest, prFileBytesResponse } from "@/lib/server/agent/pr-actions";

/**
 * Octets d'un fichier du diff d'une pull request (MIN-66) — ce que la vue diff
 * met dans ses balises `<img>` pour montrer une image modifiée côte à côte, au
 * lieu de renoncer sur « diff indisponible ».
 *  GET ?path=…&side=base|head → le fichier, sous le type MIME de son extension.
 *
 * Proxy et non lien direct : le dépôt est souvent privé, et un `<img src>` ne
 * peut pas porter le jeton d'installation. Voir `prFileBytesResponse` pour les
 * gardes (chemin dans CE diff, extension image connue, taille plafonnée).
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const path = request.nextUrl.searchParams.get("path");
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prFileBytesResponse(auth.scope, path, side);
}
