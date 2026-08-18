import { NextResponse, type NextRequest } from "next/server";

import {
  authorizeRunPrRequest,
  prAttachmentResponse,
  readUploadedFile,
} from "@/lib/server/agent/pr-actions";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * FACADE (MIN-162) of hosting an attachment — the route by PR is
 * `/api/pull-requests/[prId]/attachments`. Same reason as the neighboring facade:
 * the diff view only knows a `PrEndpoint`, not a PR id.
 *
 * A facade must bear the same guards as what it displays, otherwise it
 * is the workaround: authorization BEFORE buffering the body, then
 * same limited flow as the road via PR (MIN-348).
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
