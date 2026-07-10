import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getDomainForShare,
  refreshDomainStatus,
  removeDomain,
  serializeDomainStatus,
  setDomain,
} from "@/lib/server/custom-domains";
import { resolveShareForDomain } from "@/lib/server/view-shares";
import { isVercelDomainsConfigured } from "@/lib/server/vercel-domains";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Domaine personnalisé d'une vue partagée (MIN-36) — miroir de la route board
 * (app/api/projects/[id]/feedback/domain). GET pour qui peut gérer le partage ;
 * PUT/DELETE owner-only (attacher un domaine touche l'infra Vercel). 404 tant
 * que la vue n'a pas de share : le domaine s'attache à un lien public existant.
 */

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const resolved = await resolveShareForDomain(id, auth.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: t(resolved.errorKey) }, { status: resolved.status });
  }
  const configured = isVercelDomainsConfigured();
  const row = resolved.share ? await getDomainForShare(resolved.share.id) : null;
  if (!row) return NextResponse.json({ configured, can_manage: resolved.isOwner, domain: null });

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const domain =
    refresh && configured ? await refreshDomainStatus(row) : serializeDomainStatus(row);
  return NextResponse.json({ configured, can_manage: resolved.isOwner, domain });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const resolved = await resolveShareForDomain(id, auth.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: t(resolved.errorKey) }, { status: resolved.status });
  }
  if (!resolved.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }
  if (!resolved.share) {
    return NextResponse.json({ error: t("viewNotFound") }, { status: 404 });
  }
  if (!isVercelDomainsConfigured()) {
    return NextResponse.json({ error: t("customDomainsNotConfigured") }, { status: 503 });
  }

  const rate = checkSessionRateLimit(auth.user.id, "custom-domain", { limit: 10 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: t("invalidRequest"), retry_after: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (typeof body.domain !== "string") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result = await setDomain({ shareId: resolved.share.id }, body.domain, auth.user.id);
  if (!result.ok) {
    switch (result.error) {
      case "apex":
        return NextResponse.json({ error: t("customDomainApexUnsupported") }, { status: 400 });
      case "invalid":
      case "forbidden":
        return NextResponse.json({ error: t("customDomainInvalid") }, { status: 400 });
      case "taken":
        return NextResponse.json({ error: t("customDomainTaken") }, { status: 409 });
      case "api_error":
        return NextResponse.json({ error: t("customDomainApiError") }, { status: 502 });
    }
  }
  // Refresh immédiat : lit la cible CNAME recommandée par Vercel pour CE
  // domaine (vercel-dns-016 & co) et la persiste — les instructions DNS
  // affichées au premier rendu sont les bonnes.
  return NextResponse.json({
    configured: true,
    can_manage: true,
    domain: await refreshDomainStatus(result.row),
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const resolved = await resolveShareForDomain(id, auth.user.id);
  if (!resolved.ok) {
    return NextResponse.json({ error: t(resolved.errorKey) }, { status: resolved.status });
  }
  if (!resolved.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  const row = resolved.share ? await getDomainForShare(resolved.share.id) : null;
  // Rien à détacher → idempotent.
  if (!row)
    return NextResponse.json({
      configured: isVercelDomainsConfigured(),
      can_manage: true,
      domain: null,
    });

  const removed = await removeDomain(row);
  if (!removed) {
    return NextResponse.json({ error: t("customDomainApiError") }, { status: 502 });
  }
  return NextResponse.json({
    configured: isVercelDomainsConfigured(),
    can_manage: true,
    domain: null,
  });
}
