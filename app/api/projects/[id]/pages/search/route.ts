import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { searchProjectPages } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pages/search?q= — chercher dans le wiki du projet
 * (MIN-276), titre ET contenu.
 *
 * Chaque résultat porte son EXTRAIT : sur une recherche par contenu, le titre
 * seul ne dit pas pourquoi la page sort, et c'est justement la moitié qui
 * manquait.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await searchProjectPages({
    projectId: id,
    actorId: auth.user.id,
    query: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.hits);
}
