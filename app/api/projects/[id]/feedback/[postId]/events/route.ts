import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getServiceClient } from "@/lib/supabase-service";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import {
  getProjectFeedbackPost,
  requireProjectMember,
} from "@/lib/server/feedback/team-guard";

type RouteContext = { params: Promise<{ id: string; postId: string }> };

/** GET — le journal d'activité d'un post de feedback (MIN-57). Lecture
    service-role gardée par l'appartenance au projet : le feedback reste RLS
    deny-all, les checks d'accès vivent ici, comme le reste du canal équipe. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, postId } = await params;
  const guard = await requireProjectMember(request, id);
  if (!guard.ok) return guard.response;
  const t = await getTranslations("ApiErrors");

  const post = await getProjectFeedbackPost(id, postId);
  if (!post) {
    return NextResponse.json({ error: t("feedbackNotFound") }, { status: 404 });
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("issue_events")
    .select("*, integration:integrations(name)")
    .eq("feedback_post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/feedback/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Actions MCP : résoudre la clé (nom + agent) via le service client.
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
