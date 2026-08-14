import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { FaviconError, resolveFavicon } from "@/lib/server/favicon";
import {
  compressIconFile,
  IconFileError,
  MAX_ICON_UPLOAD_BYTES,
} from "@/lib/server/project-icon";

/**
 * POST /api/account/project-icon → { icon_url }
 *  - multipart `file` → compresse l'image et renvoie une data URL WebP.
 *  - { site_url } → résout le favicon et renvoie son URL distante.
 *
 * Aperçu, SANS projet et SANS rien stocker : le wizard de création (MIN-62)
 * montre l'icône à l'étape « Icône » alors que le projet n'existe pas encore,
 * et c'est seulement à la création que l'écriture réelle
 * (`/api/projects/[id]/icon`) la pose dans le bucket.
 *
 * `icon_url` est donc bon pour un <img> d'aperçu et assez court pour tenir dans
 * le brouillon de session — pas une URL stockée. Une image compressée pèse
 * quelques dizaines de Ko : la porter en data URL évite d'écrire dans le bucket
 * un fichier que l'abandon du wizard laisserait orphelin.
 *
 * Le fetch d'un site passe par les mêmes gardes anti-SSRF que l'import.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const isUpload = (request.headers.get("content-type") ?? "").includes(
    "multipart/form-data"
  );

  if (isUpload) {
    // Même garde que la route projet : la compression d'une image est le seul
    // travail de cet appel, et il est borné en débit (MIN-348).
    const refused = rateLimitRefusal(auth.user.id, "icon-upload", { limit: 20 });
    if (refused) return refused;

    let file: unknown;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return NextResponse.json({ error: t("iconInvalidFile") }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: t("iconInvalidFile") }, { status: 400 });
    }
    if (file.size > MAX_ICON_UPLOAD_BYTES) {
      return NextResponse.json({ error: t("iconFileTooLarge") }, { status: 413 });
    }
    try {
      const webp = await compressIconFile(Buffer.from(await file.arrayBuffer()));
      return NextResponse.json({
        icon_url: `data:image/webp;base64,${webp.toString("base64")}`,
      });
    } catch (err) {
      if (err instanceof IconFileError) {
        const key = err.key === "tooLarge" ? "iconFileTooLarge" : "iconInvalidFile";
        return NextResponse.json(
          { error: t(key) },
          { status: err.key === "tooLarge" ? 413 : 400 }
        );
      }
      console.error("[api/account/project-icon] compress failed:", err);
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }

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

  // Même motif que la route projet : une requête entrante en fait sortir
  // plusieurs (la page, puis ses icônes), donc un débit borné (MIN-341).
  const refusedImport = rateLimitRefusal(auth.user.id, "icon-import", { limit: 10 });
  if (refusedImport) return refusedImport;

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
