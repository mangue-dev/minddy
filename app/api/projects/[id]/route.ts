import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isValidKey, normalizeKey } from "@/lib/project-key";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id] — a single accessible project (owner or member). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[api/projects/:id] get failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
  return NextResponse.json(data);
}

/** PATCH /api/projects/[id] — owner-only update (RLS enforces ownership). */
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
  if (typeof input.key === "string") {
    const key = normalizeKey(input.key);
    if (!isValidKey(key)) {
      return NextResponse.json(
        { error: "La clé doit faire 2 à 5 lettres (A–Z)." },
        { status: 400 }
      );
    }
    updates.key = key;
  }
  if ("color" in input) {
    updates.color = typeof input.color === "string" ? input.color : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Tu as déjà un Projet avec cette clé.` },
        { status: 409 }
      );
    }
    console.error("[api/projects/:id] update failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  // No row → not found, or RLS blocked it (not the owner).
  if (!data) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
  return NextResponse.json(data);
}

/** DELETE /api/projects/[id] — owner-only soft delete. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/projects/:id] delete failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
