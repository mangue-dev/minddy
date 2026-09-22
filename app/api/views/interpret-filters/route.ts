import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import { runDecision } from "@/lib/server/decisions/runner";
import {
  buildViewFiltersSpec,
  filtersOfAnswers,
  resolveViewFilterOptions,
} from "@/lib/server/view-filters-ai";
import type { ViewFilters } from "@/lib/types";

/**
 * POST /api/views/interpret-filters — the filters popover's AI input
 * (MIN-592). The user types a wish ("my urgent unfinished issues"), Jev
 * picks the matching filters among the options THIS board can actually
 * filter on, and the client applies them to the config.
 *
 * Body: `{ wish: string, projectId?: string | null }` — `null` (or absent)
 * means the global cross-project board. The answer is the `ViewFilters`
 * object to merge into the active config, NOT a saved view: the client
 * writes through its own config channel, and "save" stays an explicit
 * gesture.
 *
 * Billing follows the decision layer's rule — the CALLER pays, in
 * Automations (the same budget the boards' Smart ordering spends). A dry
 * budget refuses before any engine call; both engines failing returns 502
 * and the UI keeps the user's manual filters untouched.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const userId = auth.user.id;

  let body: {
    wish?: unknown;
    projectId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const wish = typeof body.wish === "string" ? body.wish.trim() : "";
  if (!wish) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const projectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : null;

  // Same access rule as every project-scoped surface: a project board only
  // interprets for a project the caller can read.
  if (projectId && !(await getProjectAccess(userId, projectId))) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  // The caller pays in Automations — preflight like every decision caller.
  if (!(await hasUsageBudget(userId, "automations"))) {
    return NextResponse.json({ error: t("usageBudgetExceeded") }, { status: 402 });
  }

  const facets = await resolveViewFilterOptions({ projectId, userId });
  const spec = buildViewFiltersSpec({ wish, projectId, facets });

  const outcome = await runDecision(spec, {
    billTo: { userId },
    projectId,
  });
  if (!outcome) {
    return NextResponse.json({ error: t("aiProviderUnavailable") }, { status: 502 });
  }

  const filters: ViewFilters = filtersOfAnswers(spec, outcome.answers);
  return NextResponse.json({ filters, engine: outcome.engine });
}
