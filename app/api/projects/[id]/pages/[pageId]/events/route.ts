import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET /api/projects/[id]/pages/[pageId]/events — l'activité d'une page (MIN-278).
 *
 * Le jumeau exact de la route d'activité d'un objectif : même table
 * (`issue_events`, polymorphe), même hydratation des acteurs MCP, même tri
 * chronologique. La garde est la RLS — `issue_events_select` a gagné sa branche
 * « page dont je suis membre du projet » dans la migration — d'où le client de
 * SESSION et non le client service : le contrôle d'accès est déjà écrit une
 * fois, en base, pour les trois autres parents.
 *
 * La page CORBEILLÉE garde son activité lisible, comme elle garde son historique
 * (MIN-277) : la policy des pages ne cache que la ligne, et « ça a disparu, qui
 * l'a supprimée ? » est justement la question d'après l'incident.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issue_events")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/pages/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  const keyActors = await resolveApiKeyActors(
    (data ?? []).map((e) => e.api_key_id as string | null)
  );

  return NextResponse.json(
    (data ?? []).map((event) => ({
      ...event,
      api_key_name: keyActors.get(event.api_key_id as string)?.name ?? null,
      api_key_agent: keyActors.get(event.api_key_id as string)?.agent ?? null,
    }))
  );
}
