import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prAttachmentResponse,
  readUploadedFile,
} from "@/lib/server/agent/pr-actions";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Host a PR comment attachment as encrypted bytes in private storage and return
 * a capability URL. Authorization precedes reading the multipart body.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  // AUTHORIZATION FIRST (MIN-348). To read the multipart is to bring back all the
  // body in memory: do it before knowing who is calling, offer to an anonymous person
  // the memory of a function, as many times as he wants, for a query
  // which will end in 401. The order is the same on the facade by run.
  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  // Limit repeated uploads independently of the shared per-file size limit.
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
