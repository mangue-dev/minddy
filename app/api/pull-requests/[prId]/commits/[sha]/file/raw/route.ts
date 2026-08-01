import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitFileBytesResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Octets d'un fichier du diff d'un commit — ce que la vue diff met dans ses
 * `<img>` pour montrer une image côte à côte (MIN-66), aux deux refs de CE
 * commit : son parent d'un côté, lui-même de l'autre.
 *  GET ?path=…&side=base|head → le fichier, sous le type MIME de son extension.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }
  const path = request.nextUrl.searchParams.get("path");
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitFileBytesResponse(auth.scope, sha, path, side);
}
