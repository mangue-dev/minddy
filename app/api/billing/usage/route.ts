import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getUserUsage, segmentizeUsage } from "@/lib/server/usage";
import { countAccessibleProjects } from "@/lib/server/entitlements";
import type { UsageSummaryResponse } from "@/lib/billing-types";

/**
 * GET /api/billing/usage — résumé d'usage de la fenêtre courante (MIN-72) :
 * budget du plan, dépensé (coût brut USD), ventilation par segment d'affichage
 * et limites structurelles. Nourrit la barre du header et la page billing.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [usage, projectsUsed] = await Promise.all([
    getUserUsage(auth.user.id),
    countAccessibleProjects(auth.user.id),
  ]);
  const { plan } = usage.billing;

  const response: UsageSummaryResponse = {
    planId: usage.billing.planId,
    includedUsd: plan.includedUsageUsd,
    usedUsd: usage.usedUsd,
    remainingUsd: Math.max(0, plan.includedUsageUsd - usage.usedUsd),
    periodStart: usage.period.start,
    nextResetAt: usage.period.end,
    segments: segmentizeUsage(usage.byFeature),
    limits: {
      maxProjects: plan.maxProjects,
      projectsUsed,
      maxIssuesPerProject: plan.maxIssuesPerProject,
      allowAgents: plan.allowAgents,
      maxMembersPerProject: plan.maxMembersPerProject,
    },
  };
  return Response.json(response);
}
