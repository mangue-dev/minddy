import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { restorePageVersion } from "@/lib/server/page-versions";

type RouteContext = {
  params: Promise<{ id: string; pageId: string; versionId: string }>;
};

/**
 * POST — remet une version en place (MIN-277).
 *
 * Une ÉCRITURE, pas un retour en arrière : la page repart à la version
 * suivante, sous le nom de celui qui a cliqué, et l'état d'avant la
 * restauration entre lui-même dans l'historique. Restaurer ne perd donc jamais
 * rien, et se défait du même geste.
 *
 * Rend la page écrite, corps compris : l'éditeur ouvert la recharge de là.
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
