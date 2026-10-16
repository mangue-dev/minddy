import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { hasProjectAccess } from "@/lib/server/project-access";
import { createView, ensureBaselineViews } from "@/lib/server/views";
import { decodeView } from "@/lib/server/view-content";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/views — shared + own personal views (RLS scopes it).
 Seeds the baseline (system "My tickets" + default "All") when it is missing. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const listViews = () => auth.supabase
    .from("views")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  // The RLS list read runs alongside the access check; its rows are decoded
  // only once access is confirmed.
  const [access, listed] = await Promise.all([
    hasProjectAccess(auth.user.id, id),
    listViews(),
  ]);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  let { data, error } = listed;
  // A list holding the caller's system view and a visible custom view already
  // has the baseline. Otherwise seed it (the seed writes with the service
  // client, never for inaccessible projects) and read the list again.
  if (error || !hasBaselineViews(data ?? [], auth.user.id)) {
    const tBoard = await getTranslations("Board");
    await ensureBaselineViews({
      projectId: id,
      userId: auth.user.id,
      systemViewName: tBoard("myView"),
      defaultViewName: tBoard("defaultViewName"),
    });
    ({ data, error } = await listViews());
  }

  if (error) {
    console.error("[api/views] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(await Promise.all((data ?? []).map((row) =>
    decodeView(row, auth.user.id))));
}

/** The two rows `ensureBaselineViews` looks for, read from plaintext columns. */
function hasBaselineViews(rows: Array<Record<string, unknown>>, userId: string) {
  return rows.some((row) => row.kind === "my" && row.user_id === userId) &&
    rows.some((row) => row.kind === "custom" &&
      (row.user_id == null || row.user_id === userId));
}

/** POST /api/projects/[id]/views — create a saved view (shared unless `personal`). */
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
  const result = await createView({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.view, { status: 201 });
}
