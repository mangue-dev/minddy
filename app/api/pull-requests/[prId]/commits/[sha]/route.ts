import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  isCommitSha,
  prCommitDiffResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Le diff d'UN commit de la pull request — ce que CE commit change, contre son
 * parent.
 *  GET → { files, additions, deletions, url, parentSha, message, author… }
 *
 * Le SHA est validé deux fois : sa FORME ici (il finit dans une URL de forge),
 * son APPARTENANCE à cette PR côté `prCommitDiffResponse` — sans quoi la route
 * servirait le diff de n'importe quel commit du dépôt.
 */

type RouteContext = { params: Promise<{ prId: string; sha: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { prId, sha } = await params;
  if (!isCommitSha(sha)) {
    return NextResponse.json({ error: "Invalid commit sha" }, { status: 400 });
  }

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  return prCommitDiffResponse(auth.scope, sha);
}
