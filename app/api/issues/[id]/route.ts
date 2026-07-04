import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id] — a single issue (RLS: caller can access its project). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("issues")
    .select(ISSUE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] get failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Issue introuvable" }, { status: 404 });
  return NextResponse.json(mapIssueRow(data));
}

/** PATCH /api/issues/[id] — update fields (RLS enforces project access). */
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

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Le titre est obligatoire." }, { status: 400 });
    }
    updates.title = title;
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string" ? input.description : null;
  }
  if ("status" in input) {
    if (!isStatus(input.status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    updates.status = input.status;
    // Keep completed_at in sync with the done state.
    updates.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if ("priority" in input) {
    if (!isPriority(input.priority)) {
      return NextResponse.json({ error: "Priorité invalide." }, { status: 400 });
    }
    updates.priority = input.priority;
  }
  if ("effort" in input) {
    if (input.effort !== null && !isEffort(input.effort)) {
      return NextResponse.json({ error: "Effort invalide." }, { status: 400 });
    }
    updates.effort = input.effort ?? null;
  }
  if ("assignee_id" in input) {
    updates.assignee_id =
      typeof input.assignee_id === "string" ? input.assignee_id : null;
  }
  if ("due_date" in input) {
    if (!isDateOrNull(input.due_date)) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    }
    updates.due_date = input.due_date;
  }
  if ("position" in input) {
    if (typeof input.position !== "number" || !Number.isFinite(input.position)) {
      return NextResponse.json({ error: "Position invalide." }, { status: 400 });
    }
    updates.position = input.position;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("issues")
    .update(updates)
    .eq("id", id)
    .select(ISSUE_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] update failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Issue introuvable" }, { status: 404 });
  return NextResponse.json(mapIssueRow(data));
}

/** DELETE /api/issues/[id] — hard delete (RLS enforces project access). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("issues")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] delete failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Issue introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
