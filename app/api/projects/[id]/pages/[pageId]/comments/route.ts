import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { addPageComment } from "@/lib/server/page-comments";
import { getServiceClient } from "@/lib/supabase-service";
import {
  mentionsNumo,
  replyTargetsNumoPage,
  runPageCommentMention,
} from "@/lib/server/assistant/comment-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** Notice board terminal (MIN-118) — the same as the other three wires. */
const MAX_MENTIONS = 50;

/**
 * GET /api/projects/[id]/pages/[pageId]/comments — the thread for a page (MIN-282).
 *
 * SESSION client: the custody is the RLS (`page_comments_select`), which is worth
 * member of the ET living page project. Threads on a trashed page disappear
 * so with her without this road having to think about it — they follow the page, not
 * the opposite.
 *
 * The ENTIRE thread, in one query: what shows where — a thread anchored next to
 * its block, a page thread or detached in the activity — is a decision
 * display (lib/page-comments.ts), not one more request.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("page_comments")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/pages/:id/comments] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const keyActors = await resolveApiKeyActors(
    (data ?? []).map((c) => c.api_key_id as string | null)
  );
  return NextResponse.json(
    (data ?? []).map((comment) => ({
      ...comment,
      api_key_name: keyActors.get(comment.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(comment.api_key_id as string)?.agent ?? null,
    }))
  );
}

/** POST — comment on the page, or one of its blocks (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "page-comment-create");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as {
    body?: unknown;
    block_id?: unknown;
    quote?: unknown;
    parent_id?: unknown;
    mentioned_user_ids?: unknown;
  };

  const result = await addPageComment({
    pageId,
    actorId: auth.user.id,
    body: typeof input.body === "string" ? input.body : "",
    blockId: typeof input.block_id === "string" ? input.block_id : null,
    quote: typeof input.quote === "string" ? input.quote : null,
    parentId: typeof input.parent_id === "string" ? input.parent_id : null,
    mentionedUserIds: Array.isArray(input.mentioned_user_ids)
      ? input.mentioned_user_ids
          .filter((v): v is string => typeof v === "string")
          .slice(0, MAX_MENTIONS)
      : [],
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }

  const commentBody = typeof input.body === "string" ? input.body : "";
  const created = result.comment as {
    id: string;
    page_id: string;
    parent_id: string | null;
  };
  const service = getServiceClient();
  const trigger = mentionsNumo(commentBody)
    ? "mention"
    : (await replyTargetsNumoPage(service, created))
      ? "reply"
      : null;
  if (trigger) {
    const locale = await getLocale();
    const { user, supabase } = auth;
    after(() =>
      runPageCommentMention({
        supabase,
        service,
        pageId,
        actorId: user.id,
        triggerCommentId: created.id,
        locale,
        trigger,
      })
    );
  }

  return NextResponse.json(result.comment, { status: 201 });
}
