import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-constants";

type RouteContext = { params: Promise<{ id: string }> };

const isDateOrNull = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** GET /api/projects/[id]/objectives — the project's objectives. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("objectives")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/objectives] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/projects/[id]/objectives — create an objective (any member). */
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

  const row: Record<string, unknown> = { project_id: id, name };
  if (typeof input.description === "string") row.description = input.description;
  if (
    typeof input.status === "string" &&
    OBJECTIVE_STATUS_VALUES.includes(input.status as never)
  ) {
    row.status = input.status;
  }
  if (typeof input.lead_user_id === "string" || input.lead_user_id === null) {
    row.lead_user_id = input.lead_user_id ?? null;
  }
  if (isDateOrNull(input.target_date)) row.target_date = input.target_date;
  if (typeof input.color === "string" || input.color === null) {
    row.color = input.color ?? null;
  }

  const { data, error } = await auth.supabase
    .from("objectives")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[api/objectives] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
