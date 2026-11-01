import { readIssueEvents } from "@/lib/server/issue-event-store";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUserWithRlsReads } from "@/lib/server/api-auth";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id]/events — the objective's activity log (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  // The RLS read overlaps the live session check, which still gates the response.
  const auth = await getAuthedUserWithRlsReads(request, ({ user, supabase }) =>
    readIssueEvents(supabase, { objective_id: id }, { actorId: user.id }));
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await (auth.reads ?? readIssueEvents(auth.supabase, { objective_id: id }, { actorId: auth.user.id }));

  if (error) {
    console.error("[api/objectives/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // MCP Actions: Resolve key (name + agent) via customer service.
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
