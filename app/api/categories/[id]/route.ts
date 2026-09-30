import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { updateCategory } from "@/lib/server/categories";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/categories/[id] — rename / recolor (RLS: project access). */
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
  const { data: category, error } = await auth.supabase.from("categories")
    .select("id, project_id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  if (!category) return NextResponse.json({ error: t("categoryNotFound") }, { status: 404 });
  const result = await updateCategory({ categoryId: id, projectId: category.project_id,
    actorId: auth.user.id, input: (body ?? {}) as Record<string, unknown> });
  if (!result.ok) return NextResponse.json({ error: t(result.errorKey ?? "databaseError") }, { status: result.status });
  return NextResponse.json(result.category);
}

/** DELETE /api/categories/[id] — removes it (and its issue links via cascade). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data: category, error: lookupError } = await auth.supabase.from("categories")
    .select("id, project_id").eq("id", id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  if (!category || !await getProjectAccess(auth.user.id, category.project_id)) {
    return NextResponse.json({ error: t("categoryNotFound") }, { status: 404 });
  }
  const { data, error } = await getServiceClient().rpc("delete_category_guarded", {
    p_id: id, p_project_id: category.project_id, p_actor_id: auth.user.id,
  });

  if (error) {
    console.error("[api/categories/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("categoryNotFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
