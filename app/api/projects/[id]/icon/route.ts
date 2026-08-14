import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { FaviconError } from "@/lib/server/favicon";
import {
  clearProjectIcon,
  IconFileError,
  importProjectIcon,
  MAX_ICON_UPLOAD_BYTES,
  uploadProjectIcon,
} from "@/lib/server/project-icon";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Icône de projet (MIN-62) — owner uniquement.
 *  - POST multipart `file` → compresse et stocke l'image envoyée.
 *  - POST { site_url } → importe le favicon du site live.
 *  - DELETE → retire l'icône (retour à l'orbe générée).
 *
 * Deux sources pour une même ressource — « l'icône du projet » — donc une seule
 * route, qui se branche sur le content-type et répond toujours { icon_url }.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  const isUpload = (request.headers.get("content-type") ?? "").includes(
    "multipart/form-data"
  );

  if (isUpload) {
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
      const iconUrl = await uploadProjectIcon(
        id,
        Buffer.from(await file.arrayBuffer())
      );
      return NextResponse.json({ icon_url: iconUrl });
    } catch (err) {
      if (err instanceof IconFileError) {
        const key = err.key === "tooLarge" ? "iconFileTooLarge" : "iconInvalidFile";
        return NextResponse.json(
          { error: t(key) },
          { status: err.key === "tooLarge" ? 413 : 400 }
        );
      }
      console.error("[api/projects/icon] upload failed:", err);
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

  // Importer un favicon fait SORTIR une requête, et même plusieurs : la page,
  // puis chacune des icônes qu'elle déclare. La route est donc limitée en débit
  // comme link-preview, sur le même motif (MIN-341).
  const rl = checkSessionRateLimit(auth.user.id, "icon-import", { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  try {
    const iconUrl = await importProjectIcon(id, siteUrl);
    return NextResponse.json({ icon_url: iconUrl });
  } catch (err) {
    if (err instanceof FaviconError) {
      const key = err.key === "invalidUrl" ? "iconInvalidUrl" : "iconNotFound";
      return NextResponse.json(
        { error: t(key) },
        { status: err.key === "invalidUrl" ? 400 : 422 }
      );
    }
    console.error("[api/projects/icon] import failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  try {
    await clearProjectIcon(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/projects/icon] clear failed:", err);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
