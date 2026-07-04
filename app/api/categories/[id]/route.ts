import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isValidColor } from "@/lib/category-colors";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/categories/[id] — rename / recolor (RLS: project access). */
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
  if ("color" in input) {
    if (!isValidColor(input.color)) {
      return NextResponse.json({ error: "Couleur invalide." }, { status: 400 });
    }
    updates.color = input.color;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/categories/:id] update failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/categories/[id] — removes it (and its issue links via cascade). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/categories/:id] delete failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
