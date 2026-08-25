import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import {
  getDomainForBoard,
  refreshDomainStatus,
  removeDomain,
  serializeDomainStatus,
  setDomain,
  type DomainProviderOperationError,
} from "@/lib/server/custom-domains";
import { getBoardForProject } from "@/lib/server/feedback/boards";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { isVercelDomainsConfigured } from "@/lib/server/vercel-domains";

type RouteContext = { params: Promise<{ id: string }> };

async function providerOperationRefusal(
  refusal: DomainProviderOperationError,
): Promise<NextResponse> {
  const t = await getTranslations("ApiErrors");
  if (refusal.error === "provider_unavailable") {
    return NextResponse.json({ error: t("customDomainApiError") }, { status: 503 });
  }
  const retryAfter = refusal.retryAfter ?? 1;
  return NextResponse.json(
    {
      error: t("tooManyAttempts", { seconds: retryAfter }),
      retry_after: retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Custom feedback board domain (MIN-36). GET is available to every member
 * (status and DNS instructions; `?refresh=1` queries Vercel); PUT/DELETE are
 * owner-only, like other board mutations. `configured` reports whether the
 * deployment has the VERCEL_* environment variables so the UI can hide the
 * feature when it is unavailable.
 */

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const configured = isVercelDomainsConfigured();
  const board = await getBoardForProject(id);
  const row = board ? await getDomainForBoard(board.id) : null;
  if (!row) return NextResponse.json({ configured, can_manage: guard.access.isOwner, domain: null });

  // Since MIN-337, an unverified domain serves nothing. Settings therefore
  // recheck pending domains automatically instead of waiting for a click on
  // “Check Status”; the shared reservation deduplicates parallel page loads.
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  let domain = serializeDomainStatus(row);
  if (configured && (refresh || row.status !== "verified")) {
    const result = await refreshDomainStatus(row, guard.userId);
    if (!result.ok) return providerOperationRefusal(result);
    domain = result.domain;
  }
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
      case "rate_limited":
      case "operation_in_progress":
      case "provider_unavailable":
        return providerOperationRefusal(result);
    }
  }
  // The mutation reservation also covers this immediate refresh, which reads
  // and persists Vercel's domain-specific CNAME recommendation.
  const refreshed = await refreshDomainStatus(result.row, guard.userId, {
    mutationAlreadyReserved: true,
  });
  return NextResponse.json({
    configured: true,
    can_manage: true,
    domain: refreshed.ok ? refreshed.domain : serializeDomainStatus(result.row),
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

  const removed = await removeDomain(row, guard.userId);
  if (!removed.ok) {
    if (
      removed.error === "rate_limited" ||
      removed.error === "operation_in_progress" ||
      removed.error === "provider_unavailable"
    ) {
      return providerOperationRefusal(removed);
    }
    return NextResponse.json({ error: t("customDomainApiError") }, { status: 502 });
  }
  return NextResponse.json({
    configured: isVercelDomainsConfigured(),
    can_manage: true,
    domain: null,
  });
}
