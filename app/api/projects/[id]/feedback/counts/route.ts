import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — lightweight counter for the sidebar badge: canonical feedback
 still open or planned (the counterpart of the sorting counter). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;

  const service = getServiceClient();
  const { count } = await service
    .from("feedback_posts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("project_id", id)
    .is("merged_into_id", null)
    .in("status", ["open", "planned"]);

  return NextResponse.json({ count: count ?? 0 });
}
