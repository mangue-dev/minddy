import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getDomainForShare,
  refreshDomainStatus,
  removeDomain,
  serializeDomainStatus,
  setDomain,
  type DomainProviderOperationError,
} from "@/lib/server/custom-domains";
import { resolveShareForDomain } from "@/lib/server/view-shares";
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
 * Custom domain for a shared view (MIN-36), mirroring the feedback-board
 * route. GET is available to users who can manage sharing; PUT/DELETE are
 * owner-only because they change Vercel infrastructure. A view without an
 * existing public share returns 404 because domains attach to public links.
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

  // Since MIN-337, an unverified domain serves nothing. Settings therefore
  // recheck pending domains automatically; the shared reservation collapses
  // parallel page loads into one provider call.
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  let domain = serializeDomainStatus(row);
  if (configured && (refresh || row.status !== "verified")) {
    const result = await refreshDomainStatus(row, auth.user.id);
    if (!result.ok) return providerOperationRefusal(result);
    domain = result.domain;
  }
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // `null` is valid JSON: reading body.domain on it would make a 500. The
  // length is bounded by normalizeDomain (253 max, RFC hostname).
  // Same guard as the twin /api/projects/[id]/feedback/domain (MIN-118).
  if (!body || typeof body !== "object" || typeof body.domain !== "string") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const result = await setDomain(
    { shareId: resolved.share.id },
    body.domain,
    auth.user.id,
    { resourceKey: `view:${id}` },
  );
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
  // The mutation reservation also covers the immediate status refresh and
  // its domain-specific CNAME lookup.
  const refreshed = await refreshDomainStatus(result.row, auth.user.id, {
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
  // Nothing to detach → idempotent.
  if (!row)
    return NextResponse.json({
      configured: isVercelDomainsConfigured(),
      can_manage: true,
      domain: null,
    });

  const removed = await removeDomain(row, auth.user.id, {
    resourceKey: `view:${id}`,
  });
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
