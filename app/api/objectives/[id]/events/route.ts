import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/objectives/[id]/events — the objective's activity log (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issue_events")
    .select("*")
    .eq("objective_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/objectives/:id/events] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  // Actions MCP : résoudre la clé (nom + agent) via le service client.
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
