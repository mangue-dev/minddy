import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { listHiddenProjectIds } from "@/lib/server/hidden-projects";

/** GET /api/account/hidden-projects — the ids of the projects I hid (MIN-692). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await listHiddenProjectIds(auth.supabase, auth.user.id));
  } catch {
    console.error("[api/account/hidden-projects] list failed");
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
