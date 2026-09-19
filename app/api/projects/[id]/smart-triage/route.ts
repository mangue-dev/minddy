import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { runSmartTriage } from "@/lib/server/smart-triage";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/smart-triage — the board's Smart ordering
 * (MIN-566, MIN-576). Scores the project's open columns according to the
 * project's `smart_triage_mode`: static rules (`rules`, free) or one
 * decision-layer scoring pass per column (`jev`, billed to the CALLER in
 * Automations).
 *
 * Body (all optional): `{ statuses?: IssueStatus[], persist?: boolean }` —
 * the columns to score (restricted server-side to the open ones), and
 * whether the computed order is written into the positions. The board's
 * Smart sort calls with `persist: false`: the scores drive the view sort,
 * the manual drag order stays untouched. Default: persist (the order
 * becomes the board's baseline, the historical behavior).
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
  const payload = (body ?? {}) as { statuses?: unknown; persist?: unknown };
  const statuses = payload.statuses;

  try {
    const result = await runSmartTriage({
      projectId: id,
      actorId: auth.user.id,
      statuses,
      persist: payload.persist !== false,
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
      scores: result.scores,
    });
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    console.error("[api/smart-triage] failed:", (err as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
