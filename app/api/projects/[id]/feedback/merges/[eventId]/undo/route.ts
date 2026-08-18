import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { requireProjectMember } from "@/lib/server/feedback/team-guard";
import { undoMerge } from "@/lib/server/feedback/merge";

type RouteContext = { params: Promise<{ id: string; eventId: string }> };

/** POST — undoes a post merge. LIFO: if the target has been merged
 since then, you must undo the most recent merge first. The defeated pair
 is memorized: the AI ​​will never propose it again. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id, eventId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const service = getServiceClient();
  const { data: event } = await service
    .from("feedback_merge_events")
    .select("id, project_id, undone_at")
    .eq("id", eventId)
    .eq("project_id", id)
    .maybeSingle();
  if (!event || event.undone_at !== null) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const result = await undoMerge({ eventId, actorId: guard.userId });
  if (!result.ok) {
    console.error("[feedback] undo failed:", result.error);
    return NextResponse.json({ error: t("feedbackUndoFailed") }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
