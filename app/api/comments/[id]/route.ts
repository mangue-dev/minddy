import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/comments/[id] — edit (author-only, enforced by RLS). */
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
  const text = typeof (body as { body?: unknown })?.body === "string"
    ? ((body as { body: string }).body).trim()
    : "";
  if (!text) {
    return NextResponse.json({ error: "Le commentaire est vide." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("comments")
    .update({ body: text })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/comments/:id] update failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/comments/[id] — delete (author-only, enforced by RLS). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("comments")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/comments/:id] delete failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
