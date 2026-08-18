import { NextResponse, type NextRequest } from "next/server";

import {
  authorizePrRequest,
  prAttachmentResponse,
  readUploadedFile,
} from "@/lib/server/agent/pr-actions";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * POST /api/pull-requests/[prId]/attachments — hosts a file intended for a
 * PR comment and makes its URL public (MIN-162).
 *
 * In multipart and not in base64 JSON: the file only traverses, and
 * encoding it into text would cost it a third of its weight for nothing.
 *
 * The upload goes through the server (and not direct-to-storage like the parts
 * ticket attachments) because the destination is a PUBLIC bucket: this is the
 * access check to the PR, here, which prevents it from being a host of
 * open files. The details are in `prAttachmentResponse`.
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
  // Same guard as ticket attachments: destination is a bucket
  // PUBLIC of 20 MB per file, and nothing else limits the loop which
  // upload a thousand.
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
