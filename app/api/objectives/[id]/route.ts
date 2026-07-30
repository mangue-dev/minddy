import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { updateObjective } from "@/lib/server/objectives";
import { softDeleteItem } from "@/lib/server/trash";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id] — a single objective (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("objectives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[api/objectives/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  return NextResponse.json(data);
}

/** PATCH /api/objectives/[id] — update fields (access enforced in updateObjective). */
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

  const result = await updateObjective({
    objectiveId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.objective);
}

/**
 * DELETE /api/objectives/[id] — passage en corbeille (MIN-133).
 *
 * Les tickets liés ne sont PLUS détachés : `objective_id` reste, l'objectif
 * disparaît simplement des lectures (policy `objectives_select`), et les cartes
 * cessent d'afficher son nom faute de le trouver dans la liste. Restaurer le
 * rend à ses tickets exactement comme il était — un détachement, lui, aurait
 * été irréversible.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const result = await softDeleteItem("objective", id, auth.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
