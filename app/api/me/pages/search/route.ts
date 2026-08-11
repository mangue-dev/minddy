import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { runPageSearch } from "@/lib/server/pages-search";

/** Ce que ⌘K affiche d'un coup : au-delà, on tape, on ne fait pas défiler. */
const MAX_HITS = 20;

/**
 * GET /api/me/pages/search?q= — chercher dans le CONTENU des pages de TOUS mes
 * projets (MIN-276).
 *
 * Le pendant de `/api/me/search-index`, et son contraire dans la forme : cet
 * index-là est un instantané qu'on charge une fois par onglet, parce que les
 * titres se filtrent à la frappe sans serveur. Les corps, eux, ne descendent
 * pas dans le navigateur — on ne va pas envoyer le wiki entier pour le chercher
 * chez le client. Donc une route par frappe, en différé, bornée à vingt lignes.
 *
 * Aucune énumération de projets ici : la recherche part au client de SESSION,
 * et `search_pages` est SECURITY INVOKER — c'est `pages_select`, donc
 * `can_access_project`, qui décide ce que je vois. Une page d'un projet qui
 * n'est pas le mien ne sort pas, et la route n'a pas à le savoir.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  const result = await runPageSearch(auth.supabase, {
    query,
    limit: MAX_HITS,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(result.hits);
}
