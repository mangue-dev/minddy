import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { resolvePageThread } from "@/lib/server/page-comments";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; commentId: string }>;
};

/**
 * POST resolves a page thread, or reopens it with `{ "resolved": false }`
 * (MIN-1002). One route for both directions: it is the same write.
 *
 * Open to every member who can comment in the project, and carried by the
 * thread's root whichever of its messages the request names. Access is
 * checked in `resolvePageThread`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId, commentId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const resolved = (body as { resolved?: unknown } | null)?.resolved;
  if (typeof resolved !== "boolean") {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await resolvePageThread({
    pageId,
    commentId,
    actorId: auth.user.id,
    resolved,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.comment);
}
