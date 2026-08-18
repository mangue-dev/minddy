import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
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
 * Project icon (MIN-62) — owner only.
 * - POST multipart `file` → compresses and stores the sent image.
 * - POST { site_url } → imports the favicon of the live site.
 * - DELETE → removes the icon (return to the generated orb).
 *
 * Two sources for the same resource — “the project icon” — therefore only one
 * route, which plugs into the content-type and always responds to { icon_url }.
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
    // The import branch is limited since MIN-341 for its requests
    // outgoing; this one is for its CPU — 25 MB decoded then recompressed
    // in WebP by call, in a function that does nothing else (MIN-348).
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

  // Importing a favicon brings out a request, and even several: the page,
  // then each of the icons it declares. The road is therefore limited in flow
  // like link-preview, on the same pattern (MIN-341).
  const refusedImport = rateLimitRefusal(auth.user.id, "icon-import", { limit: 10 });
  if (refusedImport) return refusedImport;

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
