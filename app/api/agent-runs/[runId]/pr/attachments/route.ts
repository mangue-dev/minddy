import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prAttachmentResponse,
  readUploadedFile,
} from "@/lib/server/agent/pr-actions";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * FAÇADE (MIN-162) de l'hébergement d'une pièce jointe — la route par PR est
 * `/api/pull-requests/[prId]/attachments`. Même raison que la façade voisine :
 * la vue diff ne connaît qu'une `PrEndpoint`, pas un id de PR.
 *
 * Une façade doit porter les mêmes gardes que ce qu'elle expose, sans quoi elle
 * en est le contournement : autorisation AVANT de bufferiser le corps, puis le
 * même débit borné que la route par PR (MIN-348).
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.userId, "pr-attachment-create");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const file = await readUploadedFile(request);
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
  return prAttachmentResponse(auth.scope, file);
}
