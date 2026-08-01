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

// Borne du tableau de mentions (MIN-118) — on ne mentionne jamais autant de monde.
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

  // Commentaires MCP : résoudre la clé actrice (nom + agent) — service client,
  // la policy RLS d'api_keys est owner-only (voir api-key-actors.ts).
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
