import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { restorePage } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST /api/projects/[id]/pages/[pageId]/restore — undo a deletion.
 *
 * The page returns WITH everything that left with it (`deleted_root_id`).
 * This route is the immediate counterpart of DELETE — the one that a “Cancel” of
 * toast calls, in the context of the project where we already are; the trash
 * (`/api/me/trash/page/[id]`) does the same thing later, from the screen that
 * lists everything that can be recovered.
 *
 * If the parent is still in the trash, the page goes back to the root instead
 * que de revenir invisible.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await restorePage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, restored: result.restored });
}
