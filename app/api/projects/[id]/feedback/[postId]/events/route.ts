import { readIssueEvents } from "@/lib/server/issue-event-store";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
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

  const service = getServiceClient();
  const { data, error } = await readIssueEvents(service, { feedback_post_id: postId }, { projectId: id, actorId: guard.userId, integrations: true });

  if (error) {
    console.error("[api/feedback/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // MCP Actions: Resolve key (name + agent) via customer service.
  const keyActors = await resolveApiKeyActors(
    (data ?? []).map((e) => e.api_key_id as string | null)
  );

  return NextResponse.json(
    (data ?? []).map(({ integration, ...event }) => ({
      ...event,
      integration_name: (integration as { name: string } | null)?.name ?? null,
      api_key_name: keyActors.get(event.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(event.api_key_id as string)?.agent ?? null,
    }))
  );
}
