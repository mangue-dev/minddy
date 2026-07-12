import { NextResponse, after, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { addCommentToObjective } from "@/lib/server/add-comment";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { getServiceClient } from "@/lib/supabase-service";
import {
  mentionsNumo,
  replyTargetsNumoObjective,
  runObjectiveCommentMention,
} from "@/lib/server/assistant/comment-agent";

// @Numo replies run in after() once the response is sent — same window as the
// assistant chat route so the agent loop isn't cut mid-flight.
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id]/comments — the objective's comment thread (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("comments")
    .select("*, attachments(*)")
    .eq("objective_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/objectives/:id/comments] list failed:", error.message);
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

/** POST /api/objectives/[id]/comments — add a comment (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
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

  const result = await addCommentToObjective({
    objectiveId: id,
    actorId: auth.user.id,
    body: typeof input.body === "string" ? input.body : "",
    parentId: typeof input.parent_id === "string" ? input.parent_id : null,
    mentionedUserIds: Array.isArray(input.mentioned_user_ids)
      ? input.mentioned_user_ids.filter((v): v is string => typeof v === "string")
      : [],
    attachments: input.attachments,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }

  // @Numo → fire-and-forget agent reply, after the response is sent. Triggers:
  // an explicit @numo mention, or a reply posted right under a Numo comment.
  const commentBody = typeof input.body === "string" ? input.body : "";
  const service = getServiceClient();
  const created = result.comment as {
    id: string;
    objective_id: string;
    parent_id: string | null;
  };
  const trigger = mentionsNumo(commentBody)
    ? "mention"
    : (await replyTargetsNumoObjective(service, created))
      ? "reply"
      : null;
  if (trigger) {
    const locale = await getLocale();
    const { user, supabase } = auth;
    after(() =>
      runObjectiveCommentMention({
        supabase,
        service,
        objectiveId: id,
        actorId: user.id,
        triggerCommentId: created.id,
        locale,
        trigger,
      })
    );
  }

  return NextResponse.json(result.comment, { status: 201 });
}
