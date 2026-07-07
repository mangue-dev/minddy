import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/triage/[id]/reject — reject a pending triage item. The row is kept
 * (status 'rejected') so sources like Numo can learn from what got turned down.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // RLS scopes the update to accessible projects; the status guard makes the
  // transition atomic (a concurrently processed item matches 0 rows → 404).
  const { data, error } = await auth.supabase
    .from("triage_items")
    .update({
      status: "rejected",
      processed_by: auth.user.id,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/triage] reject failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("triageItemNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
