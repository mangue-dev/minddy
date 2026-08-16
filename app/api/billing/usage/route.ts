import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getUserUsage, segmentizeUsage } from "@/lib/server/usage";
import { countAccessibleProjects } from "@/lib/server/entitlements";
import type { UsageSummaryResponse } from "@/lib/billing-types";
import { managedServices } from "@/lib/managed-services";

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
  const services = managedServices();
  const includedUsd = services.ai ? plan.includedUsageUsd : 0;
  const usedUsd = services.ai ? usage.usedUsd : 0;

  const response: UsageSummaryResponse = {
    planId: usage.billing.planId,
    managedBilling: services.billing,
    managedAi: services.ai,
    includedUsd,
    usedUsd,
    remainingUsd: Math.max(0, includedUsd - usedUsd),
    periodStart: usage.period.start,
    nextResetAt: usage.period.end,
    segments: services.ai ? segmentizeUsage(usage.byFeature) : [],
    limits: {
      maxProjects: services.billing ? plan.maxProjects : null,
      projectsUsed,
      maxIssuesPerProject: services.billing ? plan.maxIssuesPerProject : null,
      allowAgents: services.billing ? plan.allowAgents : true,
      maxMembersPerProject: services.billing ? plan.maxMembersPerProject : null,
    },
  };
  return Response.json(response);
}
