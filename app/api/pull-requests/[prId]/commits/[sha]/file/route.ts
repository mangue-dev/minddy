import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitFileSourceResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Version AVANT-ce-commit d'un fichier de son diff — le dépliage de contexte de
 * la vue diff d'un commit.
 *  GET ?path=… → { content } (texte brut du fichier au PARENT du commit).
 *
 * Jumelle de `[prId]/file`, à un ref près, et c'est tout l'objet de la route :
 * déplier le diff d'un commit avec le merge base de la PR montrerait les lignes
 * d'avant tous les autres commits.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitFileSourceResponse(auth.scope, sha, path);
}
