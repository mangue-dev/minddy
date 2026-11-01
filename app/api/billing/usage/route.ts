import { type NextRequest } from "next/server";
import { getAuthedUserAlongside } from "@/lib/server/api-auth";
import { getUserUsage, readUserUsageInputs, segmentizeUsage } from "@/lib/server/usage";
import { countAccessibleProjects } from "@/lib/server/entitlements";
import type { UsageSummaryResponse } from "@/lib/billing-types";
import { managedServices } from "@/lib/managed-services";

/**
 * GET /api/billing/usage — usage summary of the current window (MIN-72):
 * plan budget, spent (gross cost USD), breakdown by display segment
 * and structural limits. Feeds the header bar and the page billing.
 */
export async function GET(request: NextRequest) {
  // The billing account, the latest quota reset and the project count are
  // independent side-effect-free reads: they overlap the live session check and
  // each other. The Stripe re-sync (a possible write) and the usage RPC follow.
  const auth = await getAuthedUserAlongside(request, ({ user }) =>
    Promise.all([readUserUsageInputs(user.id), countAccessibleProjects(user.id)]));
  if (!auth.ok) return auth.response;
  if ("error" in auth.alongside) throw auth.alongside.error;
  const [inputs, projectsUsed] = auth.alongside.value;

  const usage = await getUserUsage(auth.user.id, inputs);
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
