import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { FaviconError, resolveFavicon } from "@/lib/server/favicon";

/**
 * POST /api/account/project-icon — { site_url } → { icon_url }
 *
 * Aperçu du favicon d'un site, SANS projet et SANS rien stocker : le wizard de
 * création (MIN-62) montre l'icône à l'étape « Icône » alors que le projet
 * n'existe pas encore, et c'est seulement à la création que l'import réel
 * (`/api/projects/[id]/icon`) copie le fichier dans le bucket.
 *
 * `icon_url` est donc l'URL distante résolue, bonne pour un <img> d'aperçu et
 * assez courte pour tenir dans le brouillon de session — pas une URL stockée.
 * Le fetch passe par les mêmes gardes anti-SSRF que l'import.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const siteUrl = (body as { site_url?: unknown })?.site_url;
  if (typeof siteUrl !== "string" || !siteUrl.trim() || siteUrl.length > 2000) {
    return NextResponse.json({ error: t("iconInvalidUrl") }, { status: 400 });
  }

  try {
    const icon = await resolveFavicon(siteUrl);
    return NextResponse.json({ icon_url: icon.url });
  } catch (err) {
    if (err instanceof FaviconError) {
      const key = err.key === "invalidUrl" ? "iconInvalidUrl" : "iconNotFound";
      return NextResponse.json(
        { error: t(key) },
        { status: err.key === "invalidUrl" ? 400 : 422 },
      );
    }
    console.error("[api/account/project-icon] preview failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
