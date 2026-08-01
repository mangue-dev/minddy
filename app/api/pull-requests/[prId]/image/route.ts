import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prCommentImageResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * GET /api/pull-requests/[prId]/image?asset=<uuid> — une image collée dans un
 * commentaire de la PR (MIN-162).
 *
 * Sans ce détour, l'image ne s'affiche pas : l'URL que porte le corps markdown
 * exige une session GitHub que minddy n'a pas. Le pourquoi et la mesure sont
 * dans `lib/forge-image-assets` ; les gardes (identifiant contraint, cible
 * résolue par la forge, hôte vérifié, type MIME déduit du chemin) dans
 * `prCommentImageResponse`.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;
  const asset = request.nextUrl.searchParams.get("asset");
  if (!asset) return NextResponse.json({ error: "asset required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommentImageResponse(auth.scope, asset);
}
