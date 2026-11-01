import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
import { hasProjectAccess } from "@/lib/server/project-access";
import { objectiveStore } from "@/lib/server/objective-store";
import { countFeedbackForObjective, listFeedbackForObjective } from "@/lib/server/feedback/team-queries";

/** Team-only feedback; the objective's project is authorized before reading. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const countOnly = request.nextUrl.searchParams.get("count") === "1";
  // The objective is read through the user's RLS client (`objectives_select`
  // is the project access check), overlapping the live session check, which
  // still gates the response.
  const auth = await getAuthedUserWithRlsReads(request, async ({ supabase }) => {
    const { data } = await objectiveStore(supabase)
      .select("id, project_id").eq("id", id).is("deleted_at", null).maybeSingle();
    return data as { id: string; project_id: string } | null;
  });
  if (!auth.ok) return auth.response;
  const [t, objective] = await Promise.all([getTranslations("ApiErrors"), auth.reads]);
  if (!objective) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });

  // RLS does not look at `deleted_at` of the project, so living-project
  // membership is still checked; the feedback read starts alongside it and is
  // discarded when access is denied.
  const projectId = objective.project_id;
  const [access, outcome] = await Promise.all([
    hasProjectAccess(auth.user.id, projectId),
    (countOnly
      ? countFeedbackForObjective(projectId, id).then((count) => ({ count }))
      : listFeedbackForObjective(projectId, id).then((feedback) => ({ feedback }))
    ).then((body) => ({ body }), (error: unknown) => ({ error })),
  ]);
  // A denial wins over a read failure, as when access was checked first.
  if (!access) return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  if ("error" in outcome) throw outcome.error;
  return NextResponse.json(outcome.body);
}
