import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { restorePage } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST /api/projects/[id]/pages/[pageId]/restore — annuler une suppression.
 *
 * La page revient AVEC tout ce qui est parti avec elle (`deleted_root_id`).
 * Cette route est le pendant immédiat du DELETE — celle qu'un « Annuler » de
 * toast appelle, dans le contexte du projet où l'on est déjà ; la corbeille
 * (`/api/me/trash/page/[id]`) fait la même chose plus tard, depuis l'écran qui
 * liste tout ce qu'on peut rattraper.
 *
 * Si le parent est encore à la corbeille, la page remonte à la racine plutôt
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
