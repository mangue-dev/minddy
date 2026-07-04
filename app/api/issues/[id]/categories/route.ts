import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/issues/[id]/categories { category_ids } — replace the issue's category set. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const raw = (body as { category_ids?: unknown })?.category_ids;
  const requested = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];

  // RLS returns the issue only if the caller can access its project.
  const { data: issue } = await auth.supabase
    .from("issues")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!issue) {
    return NextResponse.json({ error: "Issue introuvable" }, { status: 404 });
  }

  // Keep only categories that actually belong to this issue's project.
  let valid: string[] = [];
  if (requested.length > 0) {
    const { data: cats } = await auth.supabase
      .from("categories")
      .select("id")
      .eq("project_id", issue.project_id)
      .in("id", requested);
    valid = (cats ?? []).map((c) => c.id as string);
  }

  const { error: delError } = await auth.supabase
    .from("issue_categories")
    .delete()
    .eq("issue_id", id);
  if (delError) {
    console.error("[api/issues/:id/categories] clear failed:", delError.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  if (valid.length > 0) {
    const { error: insError } = await auth.supabase
      .from("issue_categories")
      .insert(valid.map((category_id) => ({ issue_id: id, category_id })));
    if (insError) {
      console.error("[api/issues/:id/categories] set failed:", insError.message);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }
  }

  return NextResponse.json({ category_ids: valid });
}
