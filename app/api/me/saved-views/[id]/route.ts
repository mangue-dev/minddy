import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { updateSavedView } from "@/lib/server/saved-views";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/me/saved-views/[id] — renommer, ou réenregistrer sur une autre
    adresse. RLS fait la garde : la vue d'un autre compte est invisible, donc
    introuvable. */
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

  const result = await updateSavedView(
    auth.supabase,
    id,
    (body ?? {}) as { name?: unknown; href?: unknown }
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json(result.view);
}

/** DELETE /api/me/saved-views/[id] — oublier une vue enregistrée. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("saved_views")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/me/saved-views] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("viewNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
