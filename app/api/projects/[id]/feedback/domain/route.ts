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
 * Custom feedback board domain (MIN-36). GET for any member
 * (statut + instructions DNS, ?refresh=1 interroge Vercel) ; PUT/DELETE
 * owner-only, like the other mutations on the board. `configured` says if the
 * deployment has the VERCEL_* envs — without them the UI hides the feature.
 */

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const configured = isVercelDomainsConfigured();
  const board = await getBoardForProject(id);
  const row = board ? await getDomainForBoard(board.id) : null;
  if (!row) return NextResponse.json({ configured, can_manage: guard.access.isOwner, domain: null });

  // An unverified domain serves NOTHING since MIN-337: verification is
  // become the obligatory passage, so it is repeated at each opening of
  // the screen, without waiting for a click on “Check Status”. The cost (a
  // Vercel call) only concerns pending domains.
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const domain =
    configured && (refresh || row.status !== "verified")
      ? await refreshDomainStatus(row)
      : serializeDomainStatus(row);
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

  // Each attempt attaches/detaches on the Vercel side — we limit the back and forth.
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
  // `null` is valid JSON: reading body.domain on it would make a 500. The
  // length is bounded by normalizeDomain (253 max, RFC hostname).
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
  // Immediate refresh: reads the CNAME target recommended by Vercel for CE
  // domain (vercel-dns-016 & co) and persists it — DNS instructions
  // displayed at first rendering are the correct ones.
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
  // Nothing to detach → idempotent.
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
