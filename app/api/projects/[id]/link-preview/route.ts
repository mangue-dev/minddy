import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { FaviconError } from "@/lib/server/favicon";
import { resolveLinkResource } from "@/lib/server/link-resource";
import { MAX_LINK_URL_LENGTH } from "@/lib/server/attachments";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/link-preview → { url, file_name, icon_data_url }
 *
 * Le pendant de l'upload direct pour un LIEN (MIN-184) : le client poste une
 * URL, le serveur en rend le descripteur que la route d'enregistrement attend.
 * Les deux gestes deviennent alors symétriques — un fichier part vers le
 * storage puis on enregistre son descripteur, un lien part ici puis on
 * enregistre le sien — et la modal de création, où l'entité n'existe pas
 * encore, suit exactement le même chemin que la sidebar.
 *
 * Rien n'est écrit : c'est un aperçu. La route est limitée en débit parce
 * qu'elle fait SORTIR une requête HTTP côté serveur ; les gardes anti-SSRF
 * (protocole, IP privées, redirects revalidés, timeout, plafond de taille)
 * vivent dans [favicon.ts](../../../../../lib/server/favicon.ts).
 *
 * Une URL publique valide ne fait jamais échouer la route : site injoignable ou
 * favicon absent rendent un aperçu partiel (hostname pour libellé, icône nulle).
 * Seule une URL irrécupérable — protocole exotique, IP privée, DNS mort — vaut
 * un 400.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const rl = checkSessionRateLimit(auth.user.id, "link-preview", { limit: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const url = (body as { url?: unknown })?.url;
  if (
    typeof url !== "string" ||
    !url.trim() ||
    url.length > MAX_LINK_URL_LENGTH
  ) {
    return NextResponse.json({ error: t("linkInvalidUrl") }, { status: 400 });
  }

  try {
    return NextResponse.json(await resolveLinkResource(url));
  } catch (err) {
    if (err instanceof FaviconError) {
      return NextResponse.json({ error: t("linkInvalidUrl") }, { status: 400 });
    }
    console.error("[api/projects/:id/link-preview] failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
