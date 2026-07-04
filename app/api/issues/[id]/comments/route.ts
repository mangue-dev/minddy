import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id]/comments — the issue's comment thread (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("comments")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/comments] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/issues/[id]/comments — add a comment (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
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
    .insert({ issue_id: id, author_id: auth.user.id, body: text })
    .select("*")
    .single();

  if (error) {
    console.error("[api/comments] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
