import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { addCommentToIssue } from "@/lib/server/add-comment";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { getServiceClient } from "@/lib/supabase-service";
import {
  mentionsNumo,
  replyTargetsNumo,
  runCommentMention,
} from "@/lib/server/assistant/comment-agent";

// @Numo replies run in after() once the response is sent — give them the same
// window as the assistant chat route so the agent loop isn't cut mid-flight.
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

// Mention-array bound (MIN-118) — never mention that many people.
const MAX_MENTIONS = 50;

/** GET /api/issues/[id]/comments — the issue's comment thread (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("comments")
    .select("*, attachments(*)")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/comments] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // MCP comments: resolve actress key (name + agent) — customer service,
  // the api_keys RLS policy is owner-only (see api-key-actors.ts).
  const keyActors = await resolveApiKeyActors(
    (data ?? []).map((c) => c.api_key_id as string | null)
  );
  const commentIds = (data ?? []).map((comment) => comment.id as string);
  const { data: githubRows, error: githubError } = commentIds.length
    ? await auth.supabase
        .from("github_issue_comment_syncs")
        .select(
          "comment_id, author_login, author_association, html_url, created_at_remote, updated_at_remote, deleted_at_remote"
        )
        .in("comment_id", commentIds)
    : { data: [], error: null };
  if (githubError) {
    console.error("[api/comments] GitHub metadata list failed:", githubError.message);
  }
  const githubByComment = new Map(
    (githubRows ?? []).map((row) => [row.comment_id as string, row]),
  );
  return NextResponse.json(
    (data ?? []).map((comment) => ({
      ...comment,
      api_key_name: keyActors.get(comment.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(comment.api_key_id as string)?.agent ?? null,
      ...(githubByComment.has(comment.id as string)
        ? {
            github: {
              author_login: githubByComment.get(comment.id as string)?.author_login ?? null,
              author_association:
                githubByComment.get(comment.id as string)?.author_association ?? null,
              url: githubByComment.get(comment.id as string)?.html_url ?? null,
              created_at: githubByComment.get(comment.id as string)?.created_at_remote ?? null,
              updated_at: githubByComment.get(comment.id as string)?.updated_at_remote ?? null,
              deleted_at: githubByComment.get(comment.id as string)?.deleted_at_remote ?? null,
            },
          }
        : {}),
    }))
  );
}

/** POST /api/issues/[id]/comments — add a comment (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "issue-comment-create");
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
    mentioned_user_ids?: unknown;
    parent_id?: unknown;
    attachments?: unknown;
  };

  const result = await addCommentToIssue({
    issueId: id,
    actorId: auth.user.id,
    body: typeof input.body === "string" ? input.body : "",
    parentId: typeof input.parent_id === "string" ? input.parent_id : null,
    mentionedUserIds: Array.isArray(input.mentioned_user_ids)
      ? input.mentioned_user_ids
          .filter((v): v is string => typeof v === "string")
          .slice(0, MAX_MENTIONS)
      : [],
    attachments: input.attachments,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }

  // @Numo → fire-and-forget agent reply, after the response is sent. Triggers:
  // an explicit @numo mention, or (Linear-style continuation) a reply posted
  // right under a Numo comment — no re-mention needed. Human-only (Numo's own
  // comments go through the lib, not this route).
  const commentBody = typeof input.body === "string" ? input.body : "";
  const service = getServiceClient();
  const created = result.comment as {
    id: string;
    issue_id: string;
    parent_id: string | null;
  };
  const trigger = mentionsNumo(commentBody)
    ? "mention"
    : (await replyTargetsNumo(service, created))
      ? "reply"
      : null;
  if (trigger) {
    const locale = await getLocale();
    const { user, supabase } = auth;
    after(() =>
      runCommentMention({
        supabase,
        service,
        issueId: id,
        actorId: user.id,
        triggerCommentId: created.id,
        locale,
        trigger,
      })
    );
  }

  return NextResponse.json(result.comment, { status: 201 });
}
