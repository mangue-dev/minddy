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
 * - multipart `file` → compresses the image and returns a WebP URL data.
 * - { site_url } → resolves the favicon and returns its remote URL.
 *
 * Overview, WITHOUT a project and WITHOUT storing anything: the creation wizard (MIN-62)
 * shows the icon in the “Icon” step even though the project does not yet exist,
 * and it is only at creation that real writing
 * (`/api/projects/[id]/icon`) places it in the bucket.
 *
 * `icon_url` is therefore good for an overview <img> and short enough to fit in
 * the session draft — not a stored URL. A compressed image weighs
 * a few tens of KB: carrying it as a data URL avoids writing to the bucket
 * a file that abandoning the wizard would leave orphaned.
 *
 * A site fetch goes through the same anti-SSRF guards as the import.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const isUpload = (request.headers.get("content-type") ?? "").includes(
    "multipart/form-data"
  );

  if (isUpload) {
    // Same guard as the project route: the compression of an image is the only
    // work of this call, and it is limited in flow (MIN-348).
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

  // Same reason as the project route: an incoming request causes it to exit
  // several (the page, then its icons), therefore a limited flow (MIN-341).
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
