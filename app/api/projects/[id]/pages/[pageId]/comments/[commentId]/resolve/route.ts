import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { resolvePageThread } from "@/lib/server/page-comments";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; commentId: string }>;
};

/**
 * POST — RÉSOUDRE un fil, ou le rouvrir (MIN-282).
 *
 * `{ "resolved": false }` rouvre : le même verbe dans les deux sens, parce que
 * c'est le même geste — et parce qu'une route `/unresolve` en miroir se serait
 * mise à diverger de celle-ci à la première évolution.
 *
 * Ouvert à toute l'équipe (policy `page_comments_update`), et porté par la
 * RACINE du fil quel que soit le message depuis lequel on clique.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Corps absent = résoudre. Le cas courant, et il n'y a rien à valider.
    body = null;
  }
  const asked = (body as { resolved?: unknown } | null)?.resolved;

  const result = await resolvePageThread(auth.supabase, {
    commentId,
    actorId: auth.user.id,
    resolved: typeof asked === "boolean" ? asked : true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.comment);
}
