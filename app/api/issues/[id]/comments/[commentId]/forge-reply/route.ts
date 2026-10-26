import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { forgeReplyResponse } from "@/lib/server/agent/pr-comment-reply";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

/**
 * POST /api/issues/[id]/comments/[commentId]/forge-reply — answer a comment
 * mirrored from the ticket's pull request ON THE FORGE, under the caller's own
 * git account (MIN-802). Body: `{ body }`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "issue-comment-create");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  let input: { body?: unknown };
  try {
    input = ((await request.json()) ?? {}) as { body?: unknown };
  } catch {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  return forgeReplyResponse({
    userId: auth.user.id,
    supabase: auth.supabase,
    issueId: id,
    commentId,
    body: input.body,
  });
}
