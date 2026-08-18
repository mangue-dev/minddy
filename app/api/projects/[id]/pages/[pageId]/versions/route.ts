import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listPageVersions } from "@/lib/server/page-versions";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET — the history of a page (MIN-277), from newest to oldest.
 *
 * Without bodies: the list only shows who wrote and when, and the preview
 * of a version is a second call. Load twenty ProseMirror documents to
 * painting twenty date lines would be the heaviest request on the screen.
 *
 * Authors are RESOLVED here (display name, never raw email), and a
 * agent writing returns to minddy's name — the identity rule also applies
 * in a history.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await listPageVersions(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ versions: result.data });
}
