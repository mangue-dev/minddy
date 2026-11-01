import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { readFeedbackEvents } from "@/lib/server/feedback/post-reads";
import { requireFeedbackMember } from "@/lib/server/feedback/team-guard";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** GET — the activity log of a feedback post (MIN-57). Reading
 service-role kept by project membership: feedback remains RLS
 deny-all, access checks live here, like the rest of the team channel. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  // Membership and the post's presence in this project are both settled
  // before any event is read or decoded.
  const guard = await requireFeedbackMember(request, id, postId);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await readFeedbackEvents(id, postId, guard.userId);
  if (error) {
    console.error("[api/feedback/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}
