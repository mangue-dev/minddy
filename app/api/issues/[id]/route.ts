import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isEffort, isPriority, isStatus, isDateOrNull } from "@/lib/issue-validation";
import { ISSUE_SELECT, mapIssueRow } from "@/lib/server/issue-mapper";
import {
  buildFieldChangeEvents,
  insertEvents,
  type EventRow,
} from "@/lib/server/issue-events";
import { insertNotifications } from "@/lib/server/notifications";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id] — a single issue (RLS: caller can access its project). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issues")
    .select(ISSUE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  return NextResponse.json(mapIssueRow(data));
}

/** PATCH /api/issues/[id] — update fields (RLS enforces project access). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
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
  const updates: Record<string, unknown> = {};

  if (typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) {
      return NextResponse.json({ error: t("titleRequired") }, { status: 400 });
    }
    updates.title = title;
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string" ? input.description : null;
  }
  if ("status" in input) {
    if (!isStatus(input.status)) {
      return NextResponse.json({ error: t("invalidStatus") }, { status: 400 });
    }
    updates.status = input.status;
    // Keep completed_at in sync with the done state.
    updates.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if ("priority" in input) {
    if (!isPriority(input.priority)) {
      return NextResponse.json({ error: t("invalidPriority") }, { status: 400 });
    }
    updates.priority = input.priority;
  }
  if ("effort" in input) {
    if (input.effort !== null && !isEffort(input.effort)) {
      return NextResponse.json({ error: t("invalidEffort") }, { status: 400 });
    }
    updates.effort = input.effort ?? null;
  }
  if ("assignee_id" in input) {
    updates.assignee_id =
      typeof input.assignee_id === "string" ? input.assignee_id : null;
  }
  if ("objective_id" in input) {
    updates.objective_id =
      typeof input.objective_id === "string" ? input.objective_id : null;
  }
  if ("parent_id" in input) {
    // The one-level / same-project invariant is enforced by a DB trigger; a
    // violation surfaces below as a friendly 400 (P0001).
    updates.parent_id =
      typeof input.parent_id === "string" ? input.parent_id : null;
  }
  if ("due_date" in input) {
    if (!isDateOrNull(input.due_date)) {
      return NextResponse.json({ error: t("invalidDate") }, { status: 400 });
    }
    updates.due_date = input.due_date;
  }
  if ("position" in input) {
    if (typeof input.position !== "number" || !Number.isFinite(input.position)) {
      return NextResponse.json({ error: t("invalidPosition") }, { status: 400 });
    }
    updates.position = input.position;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t("noFieldsToUpdate") }, { status: 400 });
  }

  // Snapshot before the change so we can diff it into activity events.
  const { data: before } = await auth.supabase
    .from("issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await auth.supabase
    .from("issues")
    .update(updates)
    .eq("id", id)
    .select(ISSUE_SELECT)
    .maybeSingle();

  if (error) {
    // Trigger-raised invariant (sub-issue nesting) → friendly 400.
    if (error.code === "P0001") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/issues/:id] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });

  // Activity log (best-effort, service client).
  if (before) {
    const service = getServiceClient();
    const events = buildFieldChangeEvents(id, auth.user.id, before, updates);
    if ("parent_id" in updates && (updates.parent_id ?? null) !== (before.parent_id ?? null)) {
      events.push({
        issue_id: id,
        actor_id: auth.user.id,
        type: "updated",
        field: "parent",
        from_value: (before.parent_id as string) ?? null,
        to_value: (updates.parent_id as string) ?? null,
      });
      if (before.parent_id) {
        events.push({
          issue_id: before.parent_id as string,
          actor_id: auth.user.id,
          type: "sub_issue_removed",
          to_value: id,
        });
      }
      if (updates.parent_id) {
        events.push({
          issue_id: updates.parent_id as string,
          actor_id: auth.user.id,
          type: "sub_issue_added",
          to_value: id,
        });
      }
    }
    await insertEvents(service, events as EventRow[]);

    // Notify a newly-assigned user (never on self-assign).
    const newAssignee = updates.assignee_id as string | undefined;
    if (
      "assignee_id" in updates &&
      newAssignee &&
      newAssignee !== before.assignee_id &&
      newAssignee !== auth.user.id
    ) {
      await insertNotifications(service, [
        {
          user_id: newAssignee,
          project_id: (before.project_id as string) ?? null,
          type: "assigned",
          issue_id: id,
          actor_id: auth.user.id,
        },
      ]);
    }
  }

  return NextResponse.json(mapIssueRow(data));
}

/** DELETE /api/issues/[id] — hard delete (RLS enforces project access). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issues")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/issues/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
