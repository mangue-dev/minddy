import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const SORTS = ["manual", "priority", "created", "updated", "due"];

/** GET /api/projects/[id]/views — shared + own personal views (RLS scopes it). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("views")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/views] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/projects/[id]/views — create a saved view (onglet decides shared vs personal). */
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

  const onglet = input.onglet;
  if (onglet !== "my" && onglet !== "all") {
    return NextResponse.json({ error: "Onglet invalide." }, { status: 400 });
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Le nom est obligatoire." }, { status: 400 });
  }
  const sort = typeof input.sort === "string" && SORTS.includes(input.sort) ? input.sort : "manual";

  const { data, error } = await auth.supabase
    .from("views")
    .insert({
      project_id: id,
      onglet,
      // 'my' → personal (owned by me); 'all' → shared (NULL). RLS re-checks this.
      user_id: onglet === "my" ? auth.user.id : null,
      name,
      filters: input.filters ?? {},
      sort,
      display: input.display ?? {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("[api/views] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
