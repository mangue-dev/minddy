import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { listFeedbackForIssue } from "@/lib/server/feedback/team-queries";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/issues/[id]/feedback — the board feedback that this ticket highlights
 * work (MIN-196), for the “Relationships” section of the side panel.
 *
 * A separate route rather than a field in the project feedback list: the
 * panel opens on ONE ticket and only needs its zero to three lines,
 * where `/api/projects/[id]/feedback` supports up to five hundred, body
 * Understood. What is cheap for the returns page is not cheap for a
 * panel that is opened and closed twenty times.
 *
 * In READ ONLY, and this is deliberate: the link is undone since the return,
 * never from the ticket. A ticket does not know how many requests it carries, and
 * detaching them from here would remove someone from following their own without
 * the screen which shows it is in front of your eyes.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // The ticket resolves the project; access is verified above. `feedback_posts`
  // being RLS deny-all, the following reading goes through customer service — without
  // this explicit control, she would have no custody.
  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("id, project_id")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (!issue) {
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }
  const access = await getProjectAccess(auth.user.id, issue.project_id as string);
  if (!access) {
    // Invisible rather than prohibited: the same response as that of a ticket which
    // does not exist, so as not to confirm the existence of that one.
    return NextResponse.json({ error: t("issueNotFound") }, { status: 404 });
  }

  return NextResponse.json({
    feedback: await listFeedbackForIssue(issue.project_id as string, issue.id as string),
  });
}
