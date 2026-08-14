import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { createSavedView } from "@/lib/server/saved-views";

/** GET /api/me/saved-views — mes vues enregistrées, la plus récente d'abord. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("saved_views")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/me/saved-views] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/me/saved-views — enregistrer l'écran courant sous un nom. */
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

  const result = await createSavedView(
    auth.supabase,
    auth.user.id,
    (body ?? {}) as { name?: unknown; href?: unknown }
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json(result.view, { status: 201 });
}
