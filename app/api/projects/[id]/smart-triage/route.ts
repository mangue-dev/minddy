import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { runSmartTriage } from "@/lib/server/smart-triage";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/smart-triage — the board's "Smart triage" button
 * (MIN-566). Reorders the project's open columns according to the project's
 * `smart_triage_mode`: static rules (`rules`, free) or one decision-layer
 * scoring pass per column (`jev`, billed to the CALLER in Automations).
 *
 * Body (all optional): `{ statuses?: IssueStatus[] }` — the columns to
 * reorder, restricted server-side to the open ones. Off mode answers an empty
 * move list: no write, no error — the button simply does nothing.
 *
 * The move list is applied by the client (optimistic positions); the writes
 * have already happened here. A Jev budget that ran dry mid-request throws a
 * `PlanLimitError`, mapped like every pre-flight refusal.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const statuses = (body as { statuses?: unknown } | null)?.statuses;

  try {
    const result = await runSmartTriage({
      projectId: id,
      actorId: auth.user.id,
      statuses,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: t(result.errorKey) },
        { status: result.status }
      );
    }
    return NextResponse.json({
      mode: result.mode,
      moves: result.moves,
      columns: result.columns,
      scored: result.scored,
    });
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    console.error("[api/smart-triage] failed:", (err as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
