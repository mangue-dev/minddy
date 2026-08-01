import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getDomainForBoard,
  refreshDomainStatus,
  removeDomain,
  serializeDomainStatus,
  setDomain,
} from "@/lib/server/custom-domains";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { isVercelDomainsConfigured } from "@/lib/server/vercel-domains";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Domaine personnalisé du board de feedback (MIN-36). GET pour tout membre
 * (statut + instructions DNS, ?refresh=1 interroge Vercel) ; PUT/DELETE
 * owner-only, comme les autres mutations du board. `configured` dit si le
 * déploiement a les env VERCEL_* — sans elles l'UI masque la feature.
 */

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const configured = isVercelDomainsConfigured();
  const board = await getBoardForProject(id);
  const row = board ? await getDomainForBoard(board.id) : null;
  if (!row) return NextResponse.json({ configured, can_manage: guard.access.isOwner, domain: null });

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const domain =
    refresh && configured ? await refreshDomainStatus(row) : serializeDomainStatus(row);
  return NextResponse.json({ configured, can_manage: guard.access.isOwner, domain });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");
  if (!guard.access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }
  if (!isVercelDomainsConfigured()) {
    return NextResponse.json({ error: t("customDomainsNotConfigured") }, { status: 503 });
  }

  // Chaque tentative attache/détache côté Vercel — on borne les allers-retours.
  const rate = checkSessionRateLimit(guard.userId, "custom-domain", { limit: 10 });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: t("tooManyAttempts", { seconds: rate.retryAfter }),
        retry_after: rate.retryAfter,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` est du JSON valide : lire body.domain dessus ferait un 500. La
  // longueur, elle, est bornée par normalizeDomain (253 max, RFC hostname).
  if (!body || typeof body !== "object" || typeof body.domain !== "string") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const board = await getBoardForProject(id);
  if (!board) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const result = await setDomain({ boardId: board.id }, body.domain, guard.userId);
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
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");
  if (!guard.access.isOwner) {
    return NextResponse.json({ error: t("ownerOnly") }, { status: 403 });
  }

  const board = await getBoardForProject(id);
  const row = board ? await getDomainForBoard(board.id) : null;
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
