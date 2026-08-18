import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { restorePageVersion } from "@/lib/server/page-versions";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; versionId: string }>;
};

/**
 * POST — re-establishes a version (MIN-277).
 *
 * A WRITING, not a return: the page goes back to the version
 * next, under the name of the person who clicked, and the state before the
 * restoration between itself in history. Restore therefore never loses
 * nothing, and is undone with the same gesture.
 *
 * Returns the written page, body included: the open editor reloads it from there.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId, versionId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await restorePageVersion(pageId, versionId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
