import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/triage — the project's pending triage items. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("triage_items")
    .select("*")
    .eq("project_id", id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/triage] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/**
 * POST /api/projects/[id]/triage — intake: drop a proto-issue in the arrival
 * zone. Canonical entry point for anything that is NOT the official create
 * dialog (Numo and future sources); the dialog keeps posting to /issues.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
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
  const input = (body ?? {}) as Record<string, unknown>;

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    project_id: id,
    title,
    created_by: auth.user.id,
  };
  if (typeof input.description === "string") row.description = input.description;
  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (source) row.source = source;

  const { data, error } = await auth.supabase
    .from("triage_items")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[api/triage] create failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
