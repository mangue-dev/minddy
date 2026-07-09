import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { createView, ensureBaselineViews } from "@/lib/server/views";

/** GET /api/me/views — the caller's global (cross-project) views, all personal.
    Seeds the baseline (system "Mes tickets" + default "Toutes") first. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const tBoard = await getTranslations("Board");
  await ensureBaselineViews({
    projectId: null,
    userId: auth.user.id,
    systemViewName: tBoard("myView"),
    defaultViewName: tBoard("defaultViewName"),
  });

  const { data, error } = await auth.supabase
    .from("views")
    .select("*")
    .is("project_id", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/me/views] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/me/views — create a personal global view. */
export async function POST(request: NextRequest) {
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
    projectId: null,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.view, { status: 201 });
}
