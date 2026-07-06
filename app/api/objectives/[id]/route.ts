import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { OBJECTIVE_STATUS_VALUES } from "@/lib/objective-constants";
import { isDateOrNull } from "@/lib/issue-validation";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id] — a single objective (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("objectives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[api/objectives/:id] get failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  return NextResponse.json(data);
}

/** PATCH /api/objectives/[id] — update fields (RLS: project access). */
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

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
    }
    updates.name = name;
  }
  if ("description" in input) {
    updates.description =
      typeof input.description === "string" ? input.description : null;
  }
  if ("status" in input) {
    if (
      typeof input.status !== "string" ||
      !OBJECTIVE_STATUS_VALUES.includes(input.status as never)
    ) {
      return NextResponse.json({ error: t("invalidStatus") }, { status: 400 });
    }
    updates.status = input.status;
  }
  if ("lead_user_id" in input) {
    updates.lead_user_id =
      typeof input.lead_user_id === "string" ? input.lead_user_id : null;
  }
  if ("target_date" in input) {
    if (!isDateOrNull(input.target_date)) {
      return NextResponse.json({ error: t("invalidDate") }, { status: 400 });
    }
    updates.target_date = input.target_date;
  }
  if ("color" in input) {
    updates.color = typeof input.color === "string" ? input.color : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: t("noFieldsToUpdate") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("objectives")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/objectives/:id] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE /api/objectives/[id] — removes it; linked issues are detached (SET NULL). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("objectives")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/objectives/:id] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
