import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { listIntegrations, createIntegration } from "@/lib/server/integrations";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/integrations — list (any accessible user). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  const integrations = await listIntegrations(id);
  if (!integrations) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ integrations, isOwner: access.isOwner });
}

/** POST /api/projects/[id]/integrations — owner creates a named API key.
    The 201 response is the ONLY time the plaintext key ever leaves the server. */
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

  const result = await createIntegration({
    projectId: id,
    actorId: auth.user.id,
    name: (body as { name?: unknown })?.name,
    kind: (body as { kind?: unknown })?.kind,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json(
    { integration: result.integration, key: result.key },
    { status: 201 }
  );
}
