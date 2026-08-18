import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { createView, ensureBaselineViews } from "@/lib/server/views";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/views — shared + own personal views (RLS scopes it).
 Seeds the baseline (system "My tickets" + default "All") first. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // The seed writes with the service client — never for inaccessible projects.
  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  const tBoard = await getTranslations("Board");
  await ensureBaselineViews({
    projectId: id,
    userId: auth.user.id,
    systemViewName: tBoard("myView"),
    defaultViewName: tBoard("defaultViewName"),
  });

  const { data, error } = await auth.supabase
    .from("views")
    .select("*")
    .eq("project_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/views] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
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
