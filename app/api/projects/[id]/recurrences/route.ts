import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/recurrences — the active recurrences of the project
 * (MIN-136), for the “Recurrences” tab of its parameters.
 *
 * A single living ticket per series carries a cadence: the list of tickets where
 * `recurrence is not null` IS the list of recurrences. Nothing to filter on the
 * status — a completed ticket has passed its cadence to its successor, a ticket
 * canceled lost it (lib/server/update-issue.ts), and the trash is already
 * excluded by the `issues_select` policy.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("issues")
    .select("id, number, title, status, assignee_id, due_date, recurrence")
    .eq("project_id", id)
    .not("recurrence", "is", null)
    // The next deadline first: this is the order in which we read them.
    .order("due_date", { ascending: true });

  if (error) {
    console.error("[api/recurrences] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
