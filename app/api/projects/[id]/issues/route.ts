import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import { insertEvents, type EventRow } from "@/lib/server/issue-events";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/issues — all issues of an accessible project. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // RLS issues_select scopes to accessible projects; ordering by position then
  // number gives a stable per-column order.
  const { data, error } = await auth.supabase
    .from("issues")
    .select(ISSUE_SELECT)
    .eq("project_id", id)
    .order("position", { ascending: true })
    .order("number", { ascending: true });

  if (error) {
    console.error("[api/issues] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json((data ?? []).map(mapIssueRow));
}

/** POST /api/projects/[id]/issues — create an issue (assigns CLÉ-number atomically). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

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
    position: Date.now(),
  };
  if (typeof input.description === "string") row.description = input.description;
  if (isStatus(input.status)) {
    row.status = input.status;
    if (input.status === "done") row.completed_at = new Date().toISOString();
  }
  if (isPriority(input.priority)) row.priority = input.priority;
  if (input.effort === null || isEffort(input.effort)) row.effort = input.effort ?? null;
  if (typeof input.assignee_id === "string" || input.assignee_id === null) {
    row.assignee_id = input.assignee_id ?? null;
  }
  if (typeof input.objective_id === "string" || input.objective_id === null) {
    row.objective_id = input.objective_id ?? null;
  }
  if (isDateOrNull(input.due_date)) row.due_date = input.due_date;

  const service = getServiceClient();

  // Sub-issue: validate the parent (same project, top-level) and, unless an
  // objective was explicitly set, inherit the parent's objective (plan §4).
  if (typeof input.parent_id === "string") {
    const { data: parent } = await service
      .from("issues")
      .select("id, project_id, parent_id, objective_id")
      .eq("id", input.parent_id)
      .maybeSingle();
    if (!parent || parent.project_id !== id) {
      return NextResponse.json({ error: t("parentIssueNotFound") }, { status: 400 });
    }
    if (parent.parent_id) {
      return NextResponse.json(
        { error: t("nestingLimitedToOneLevel") },
        { status: 400 }
      );
    }
    row.parent_id = input.parent_id;
    if (!("objective_id" in input)) row.objective_id = parent.objective_id;
  }

  const { data: number, error: counterError } = await service.rpc("next_issue_number", {
    p_project_id: id,
  });
  if (counterError || typeof number !== "number") {
    console.error("[api/issues] counter failed:", counterError?.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  row.number = number;

  const { data, error } = await service
    .from("issues")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    if (error.code === "P0001") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/issues] create failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Attach categories (only those that belong to this project).
  let categoryIds: string[] = [];
  const requested = Array.isArray(input.category_ids)
    ? input.category_ids.filter((v): v is string => typeof v === "string")
    : [];
  if (requested.length > 0) {
    const { data: cats } = await service
      .from("categories")
      .select("id")
      .eq("project_id", id)
      .in("id", requested);
    categoryIds = (cats ?? []).map((c) => c.id as string);
    if (categoryIds.length > 0) {
      await service
        .from("issue_categories")
        .insert(categoryIds.map((category_id) => ({ issue_id: data.id, category_id })));
    }
  }

  // Activity: creation + "sub-issue added" on the parent.
  const events: EventRow[] = [
    { issue_id: data.id, actor_id: auth.user.id, type: "created" },
  ];
  if (data.parent_id) {
    events.push({
      issue_id: data.parent_id,
      actor_id: auth.user.id,
      type: "sub_issue_added",
      to_value: data.id,
    });
  }
  await insertEvents(service, events);

  return NextResponse.json({ ...data, category_ids: categoryIds }, { status: 201 });
}
