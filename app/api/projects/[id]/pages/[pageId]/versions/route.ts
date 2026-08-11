import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listPageVersions } from "@/lib/server/page-versions";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET — l'historique d'une page (MIN-277), du plus récent au plus ancien.
 *
 * Sans les corps : la liste ne montre que qui a écrit et quand, et l'aperçu
 * d'une version est un second appel. Charger vingt documents ProseMirror pour
 * peindre vingt lignes de dates serait la requête la plus lourde de l'écran.
 *
 * Les auteurs sont RÉSOLUS ici (nom d'affichage, jamais l'email brut), et une
 * écriture d'agent revient au nom de minddy — la règle d'identité vaut aussi
 * dans un historique.
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
