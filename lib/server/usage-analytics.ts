import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUsagePeriod } from "@/lib/server/usage";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { buildUsageDays, type DailyUsageRow } from "@/lib/usage-analytics";
import type { UsageAnalyticsResponse } from "@/lib/billing-types";

export async function getUsageAnalytics(
  userId: string,
): Promise<UsageAnalyticsResponse> {
  const billing = await getResolvedBilling(userId);
  const period = await getUsagePeriod(userId, billing);
  const observedAt = new Date().toISOString();
  const response: UsageAnalyticsResponse = {
    periodStart: period.start,
    periodEnd: period.end,
    observedAt,
    includedUsd: isManagedAiEnabled() ? billing.plan.includedUsageUsd : 0,
    days: [],
  };
  if (!isManagedAiEnabled()) return response;
  const until = new Date(
    Math.min(Date.parse(period.end), Date.parse(observedAt)),
  ).toISOString();
  const { data, error } = await getServiceClient().rpc("get_user_usage_daily", {
    p_user_id: userId,
    p_since: period.start,
    p_until: until,
  });
  if (error) throw new Error(error.message);
  response.days = buildUsageDays(
    (data ?? []) as DailyUsageRow[],
    period.start,
    period.end,
    observedAt,
  );
  return response;
}
