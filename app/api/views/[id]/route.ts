import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const SORTS = ["manual", "priority", "created", "updated", "due"];

/** PATCH /api/views/[id] — update a view (RLS: shared or your own personal). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
    }
    updates.name = name;
  }
  if ("filters" in input) updates.filters = input.filters ?? {};
  if ("display" in input) updates.display = input.display ?? {};
  if ("sort" in input) {
    if (typeof input.sort !== "string" || !SORTS.includes(input.sort)) {
      return NextResponse.json({ error: "Tri invalide." }, { status: 400 });
    }
    updates.sort = input.sort;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("views")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/views/:id] update failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Vue introuvable" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/views/[id] — delete a view (RLS enforces ownership/sharing). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("views")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/views/:id] delete failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Vue introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
