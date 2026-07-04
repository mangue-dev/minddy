import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { DEFAULT_CATEGORY_COLOR, isValidColor } from "@/lib/category-colors";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/categories — the project's categories. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("categories")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/categories] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/projects/[id]/categories — create a category (any member). */
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
  const input = (body ?? {}) as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
  }
  const color = isValidColor(input.color) ? input.color : DEFAULT_CATEGORY_COLOR;

  const { data, error } = await auth.supabase
    .from("categories")
    .insert({ project_id: id, name, color })
    .select("*")
    .single();

  if (error) {
    console.error("[api/categories] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
