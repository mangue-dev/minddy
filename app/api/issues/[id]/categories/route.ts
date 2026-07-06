import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents, type EventRow } from "@/lib/server/issue-events";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/issues/[id]/categories { category_ids } — replace the issue's category set. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
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
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
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

  // Snapshot the current set so we can log which categories were added/removed.
  const { data: currentRows } = await auth.supabase
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", id);
  const current = new Set((currentRows ?? []).map((r) => r.category_id as string));

  const { error: delError } = await auth.supabase
    .from("issue_categories")
    .delete()
    .eq("issue_id", id);
  if (delError) {
    console.error("[api/issues/:id/categories] clear failed:", delError.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  if (valid.length > 0) {
    // upsert + ignoreDuplicates: tolerate a concurrent request having already
    // inserted the same (issue_id, category_id) pair, so it can't 500 on the
    // join table's primary key.
    const { error: insError } = await auth.supabase
      .from("issue_categories")
      .upsert(valid.map((category_id) => ({ issue_id: id, category_id })), {
        onConflict: "issue_id,category_id",
        ignoreDuplicates: true,
      });
    if (insError) {
      console.error("[api/issues/:id/categories] set failed:", insError.message);
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }

  // Activity: one event per added / removed category.
  const nextSet = new Set(valid);
  const events: EventRow[] = [];
  for (const cid of valid) {
    if (!current.has(cid)) {
      events.push({ issue_id: id, actor_id: auth.user.id, type: "category_added", to_value: cid });
    }
  }
  for (const cid of current) {
    if (!nextSet.has(cid)) {
      events.push({ issue_id: id, actor_id: auth.user.id, type: "category_removed", from_value: cid });
    }
  }
  await insertEvents(getServiceClient(), events);

  return NextResponse.json({ category_ids: valid });
}
