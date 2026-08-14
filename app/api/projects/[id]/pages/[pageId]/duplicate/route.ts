import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { duplicatePage } from "@/lib/server/pages";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST /api/projects/[id]/pages/[pageId]/duplicate — copier une page.
 *
 * RÉCURSIF, comme la corbeille : une page est un arbre, et dupliquer la racine
 * sans ses sous-pages rendrait une copie amputée dont les blocs pointent vers
 * les enfants de l'ORIGINAL. Les liens internes à la branche sont réécrits vers
 * la copie (`remapSubpages`), ceux qui sortent de la branche sont laissés tels
 * quels.
 *
 * Rend la page racine de la copie, corps compris : c'est d'elle que le bloc
 * sous-page tire son `pageId`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // Le geste le plus multiplicateur du wiki : une branche entière copiée par
  // appel, corps compris. Plus serré que la création simple, pour la même
  // raison qui le rend pratique (MIN-348).
  const refused = rateLimitRefusal(auth.user.id, "page-duplicate", { limit: 10 });
  if (refused) return refused;

  const result = await duplicatePage(pageId, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.page);
}
