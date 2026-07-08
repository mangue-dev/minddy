import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getUserStats } from "@/lib/server/stats";

/** GET /api/stats?tz=… — the caller's personal statistics (MIN-12). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const tz = request.nextUrl.searchParams.get("tz") || "UTC";

  try {
    const stats = await getUserStats(auth.supabase, { tz, userId: auth.user.id });
    return NextResponse.json(stats);
  } catch (e) {
    console.error("[api/stats] failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
