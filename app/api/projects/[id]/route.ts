import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { updateProjectSettings } from "@/lib/server/update-project";
import { softDeleteItem } from "@/lib/server/trash";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] — a single accessible project (owner or member). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[api/projects/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  return NextResponse.json(data);
}

/** PATCH /api/projects/[id] — owner-only update of name / key / color. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await updateProjectSettings({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.project);
}

/**
 * DELETE /api/projects/[id] — passage en corbeille, propriétaire seul (MIN-133).
 * Ses tickets, objectifs et feedbacks ne bougent pas : ils redeviennent visibles
 * tels quels quand le projet est restauré.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await softDeleteItem("project", id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
