import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { runSmartTriage } from "@/lib/server/smart-triage";

type RouteContext = { params: Promise<{ id: string }> };

/** Reorder open columns using deterministic rules; persist=false leaves positions unchanged. */
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
    console.error("[api/smart-triage] failed:", (err as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
