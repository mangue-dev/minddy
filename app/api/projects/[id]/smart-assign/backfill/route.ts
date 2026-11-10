import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import {
  readSmartAssignBackfill,
  requestSmartAssignBackfill,
  type SmartAssignBackfillState,
} from "@/lib/server/smart-assign";

type RouteContext = { params: Promise<{ id: string }> };

// The first pass runs after the response and may wait on several decisions.
export const maxDuration = 60;

async function respond(state: SmartAssignBackfillState) {
  if (state.ok) {
    return NextResponse.json({
      count: state.count,
      running: state.running,
      rules_missing: state.rulesMissing,
    });
  }
  const t = await getTranslations("ApiErrors");
  return NextResponse.json({ error: t(state.errorKey) }, { status: state.status });
}

/**
 * GET /api/projects/[id]/smart-assign/backfill — how many open issues have
 * no assignee and were never assigned, and whether a backfill is filling them
 * (MIN-903), and whether a member still lacks the assignment rule a backfill
 * requires. Owner only.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  return respond(await readSmartAssignBackfill(auth.user.id, id));
}

/**
 * POST /api/projects/[id]/smart-assign/backfill — the owner asks Smart Assign
 * to assign those issues. It never replaces an assignee: each issue is
 * claimed only if it is still empty when its turn comes.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "smart-assign-backfill", { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return respond(await requestSmartAssignBackfill(auth.user.id, id));
}
