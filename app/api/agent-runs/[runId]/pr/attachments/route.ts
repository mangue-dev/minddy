import { NextResponse, type NextRequest } from "next/server";

import { authorizeRunPrRequest, prAttachmentResponse } from "@/lib/server/agent/pr-actions";

/**
 * FAÇADE (MIN-162) de l'hébergement d'une pièce jointe — la route par PR est
 * `/api/pull-requests/[prId]/attachments`. Même raison que la façade voisine :
 * la vue diff ne connaît qu'une `PrEndpoint`, pas un id de PR.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });

  const auth = await authorizeRunPrRequest(request, runId);
  if (!auth.ok) return auth.response;
  return prAttachmentResponse(auth.scope, file);
}
