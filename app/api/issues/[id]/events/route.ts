import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id]/events — the issue's activity log (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("issue_events")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/events] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}
