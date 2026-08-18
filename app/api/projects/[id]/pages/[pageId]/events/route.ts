import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * GET /api/projects/[id]/pages/[pageId]/events — page activity (MIN-278).
 *
 * The exact twin of a goal's activity route: same table
 * (`issue_events`, polymorphic), same hydration of MCP actors, same sorting
 * chronological. The guard is the RLS — `issue_events_select` has won its branch
 * “page of which project I am a member” in the migration — hence the client
 * SESSION and not the client service: the access control is already written once
 * times, as a base, for the other three parents.
 *
 * The BASKET page keeps its activity readable, just as it keeps its history
 * (MIN-277): the page policy only hides the line, and “it has disappeared, which
 * deleted it? » is precisely the question after the incident.
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
