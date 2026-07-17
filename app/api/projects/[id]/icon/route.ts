import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { clearProjectIcon, FaviconError, importProjectIcon } from "@/lib/server/favicon";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Icône de projet (MIN-62) — owner uniquement.
 *  - POST { site_url } → importe le favicon du site live, renvoie { icon_url }.
 *  - DELETE → retire l'icône (retour à l'orbe générée).
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
