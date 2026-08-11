import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { addPageComment } from "@/lib/server/page-comments";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/** Borne du tableau de mentions (MIN-118) — la même que les trois autres fils. */
const MAX_MENTIONS = 50;

/**
 * GET /api/projects/[id]/pages/[pageId]/comments — le fil d'une page (MIN-282).
 *
 * Client de SESSION : la garde est la RLS (`page_comments_select`), qui vaut
 * membre du projet ET page vivante. Les fils d'une page corbeillée disparaissent
 * donc avec elle sans que cette route ait à y penser — ils suivent la page, pas
 * l'inverse.
 *
 * Le fil ENTIER, résolus compris : masquer les fils clos est une décision
 * d'affichage, et le bouton qui les rouvre doit pouvoir les montrer sans un
 * second aller-retour.
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

/** POST — commenter la page, ou un de ses blocs (auteur = l'appelant). */
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
  return NextResponse.json(result.comment, { status: 201 });
}
