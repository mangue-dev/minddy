import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { objectiveStore } from "@/lib/server/objective-store";
import { listFeedbackForObjective } from "@/lib/server/feedback/team-queries";

/** Team-only feedback; the objective's project is authorized before reading. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const { data: objective } = await objectiveStore(getServiceClient())
    .select("id, project_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!objective || !await getProjectAccess(auth.user.id, objective.project_id)) {
    return NextResponse.json({ error: t("objectiveNotFound") }, { status: 404 });
  }
  return NextResponse.json({ feedback: await listFeedbackForObjective(objective.project_id, id) });
}
