import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id]/events — the issue's activity log (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issue_events")
    .select("*, integration:integrations(name)")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  // Flatten the embedded integration into integration_name for the timeline.
  return NextResponse.json(
    (data ?? []).map(({ integration, ...event }) => ({
      ...event,
      integration_name:
        (integration as { name: string } | null)?.name ?? null,
    }))
  );
}
