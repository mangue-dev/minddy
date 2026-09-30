import { NextResponse, type NextRequest } from "next/server";
import { getBoardByToken } from "@/lib/server/feedback/boards";
import { openFeedbackDraft, sealFeedbackDraft } from "@/lib/server/feedback/draft";
import { validFeedbackDraft, type FeedbackDraftSnapshot } from "@/lib/feedback-draft";
import { withPrivateNoStore } from "@/lib/server/private-response";
import { isSameOriginRequest } from "@/lib/server/same-origin";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { getClientIp } from "@/lib/server/request-ip";
import { readBoundedRequestBody } from "@/lib/server/forge-relay/request-body";

export const runtime = "nodejs";
export const POST = withPrivateNoStore(async (request: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { token } = await params;
  const refusal = rateLimitRefusal(`ip:${getClientIp(request)}`, "public-feedback-drafts", { limit: 120 });
  if (refusal) return refusal;
  try {
    const ctx = await getBoardByToken(token);
    if (!ctx || !ctx.board.enabled) return NextResponse.json({ error: "notFound" }, { status: 404 });
    const incoming = await readBoundedRequestBody(request, 64 * 1024);
    if (!incoming.ok) return NextResponse.json({ error: "tooLarge" }, { status: 413 });
    const body = JSON.parse(incoming.body) as { operation?: string; value?: unknown; snapshot?: FeedbackDraftSnapshot };
    let payload: unknown;
    if (body.operation === "seal" && validFeedbackDraft(body.value)) payload = { snapshot: await sealFeedbackDraft(ctx.board, body.value) };
    else if (body.operation === "open" && body.snapshot) payload = { value: await openFeedbackDraft(ctx.board, body.snapshot) };
    else return NextResponse.json({ error: "badRequest" }, { status: 400 });
    // Board deletion, revocation, or replacement during crypto must not release a draft.
    const current = await getBoardByToken(token);
    if (!current?.board.enabled || current.board.id !== ctx.board.id || current.board.project_id !== ctx.board.project_id) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "draftUnavailable" }, { status: 503 });
  }
});
