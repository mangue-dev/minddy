import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { exportPage } from "@/lib/server/pages-export";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET /api/projects/[id]/pages/[pageId]/export — emporter une page (MIN-283).
 *
 * `?scope=branch` prend la page ET ses sous-pages, et rend alors un `.zip` :
 * un fichier par page, l'imbrication en dossiers, les blocs sous-page réécrits
 * en liens relatifs. Sans lui, un seul `.md`.
 *
 * Le PDF n'a pas de route : il passe par l'impression du navigateur sur la vue
 * (feuille `@media print`, cf. app/globals.css). Un moteur de rendu PDF dans une
 * fonction serveur, c'est un paquet de plusieurs centaines de mégaoctets, un
 * temps de démarrage à froid et une seconde définition de la mise en page à
 * tenir — pour produire ce que le navigateur produit déjà, depuis le document
 * qui est justement à l'écran.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await exportPage({
    pageId,
    actorId: auth.user.id,
    branch: request.nextUrl.searchParams.get("scope") === "branch",
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }

  // `filename*` en UTF-8 : les titres de page portent des accents et des
  // émojis, et un `filename=` nu les rendrait illisibles côté navigateur.
  return new NextResponse(result.body as unknown as BodyInit, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
