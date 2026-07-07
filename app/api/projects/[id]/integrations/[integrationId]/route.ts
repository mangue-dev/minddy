import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { revokeIntegration, updateIntegrationWebhook } from "@/lib/server/integrations";

type RouteContext = { params: Promise<{ id: string; integrationId: string }> };

/** PATCH /api/projects/[id]/integrations/[integrationId] — owner configures
    the outgoing webhook (url + followed events + scope). url null = disabled. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id, integrationId } = await params;
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

  const result = await updateIntegrationWebhook({
    projectId: id,
    integrationId,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json({ integration: result.integration });
}

/** DELETE /api/projects/[id]/integrations/[integrationId] — owner revokes the
    key (soft: sets revoked_at, the row survives so attribution keeps its name). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, integrationId } = await params;
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

  const result = await revokeIntegration({ projectId: id, integrationId });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
