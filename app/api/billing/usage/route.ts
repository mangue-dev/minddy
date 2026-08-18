import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getUserUsage, segmentizeUsage } from "@/lib/server/usage";
import { countAccessibleProjects } from "@/lib/server/entitlements";
import type { UsageSummaryResponse } from "@/lib/billing-types";
import { managedServices } from "@/lib/managed-services";

/**
 * GET /api/billing/usage — usage summary of the current window (MIN-72):
 * plan budget, spent (gross cost USD), breakdown by display segment
 * and structural limits. Feeds the header bar and the page billing.
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
