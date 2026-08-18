import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { duplicatePage } from "@/lib/server/pages";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST /api/projects/[id]/pages/[pageId]/duplicate — copy a page.
 *
 * RECURSIVE, like the recycle bin: a page is a tree, and duplicate the root
 * without its subpages would render an amputated copy whose blocks point to
 * the children of the ORIGINAL. Internal branch links are rewritten to
 * copy (`remapSubpages`), those that exit the branch are left as they are
 * quels.
 *
 * Returns the root page of the copy, body included: it is from it that the block
 * subpage gets its `pageId`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // The most multiplier gesture on the wiki: an entire branch copied by
  // call, body included. Tighter than simple creation, for the same
  // reason which makes it practical (MIN-348).
  const refused = rateLimitRefusal(auth.user.id, "page-duplicate", { limit: 10 });
  if (refused) return refused;

  const result = await duplicatePage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}
