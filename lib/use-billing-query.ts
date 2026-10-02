"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchBillingStatusApi,
  fetchBillingUsageApi,
  fetchUsageAnalyticsApi,
} from "@/lib/billing-api";
import type { UsageSummaryResponse } from "@/lib/billing-types";

export const billingStatusQueryKey = ["billing", "status"] as const;
export const billingUsageQueryKey = ["billing", "usage"] as const;
export const billingAnalyticsQueryKey = ["billing", "analytics"] as const;

/** Analytics are fetched only on the billing page, with a distinct cache per window. */
export function useBillingUsageAnalytics(usage: UsageSummaryResponse | null) {
  return useQuery({
    queryKey: [
      ...billingAnalyticsQueryKey,
      usage?.periodStart,
      usage?.nextResetAt,
    ],
    queryFn: fetchUsageAnalyticsApi,
    enabled: !!usage?.managedAi,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export type UsageState = "normal" | "warning" | "low" | "exhausted";

/**
 * Shared billing state for the page and usage popover: plan, included budget,
 * consumption, remaining percentage, alert state, and segment breakdown.
 */
export function useBillingSummary() {
  const status = useQuery({
    queryKey: billingStatusQueryKey,
    queryFn: fetchBillingStatusApi,
    staleTime: 60_000,
  });
  const usage = useQuery({
    queryKey: billingUsageQueryKey,
    queryFn: fetchBillingUsageApi,
    staleTime: 60_000,
    // The ledger is written per generation while a Numo turn or a code worker
    // runs (one row per LLM round), so a client that never refetches shows a
    // frozen meter for the whole run. One light read per minute keeps the
    // header honest without hammering the endpoint.
    refetchInterval: 60_000,
  });

  const includedUsd = usage.data?.includedUsd ?? 0;
  const usedUsd = usage.data?.usedUsd ?? 0;
  const percent =
    includedUsd > 0 ? Math.min((usedUsd / includedUsd) * 100, 100) : 0;
  const remainingRatio = includedUsd > 0 ? 1 - usedUsd / includedUsd : 1;
  // Remaining usage is clamped, while consumption can slightly exceed the budget.
  const remainingPercent = 100 - percent;

  const state: UsageState =
    includedUsd > 0 && usedUsd >= includedUsd
      ? "exhausted"
      : remainingRatio < 0.1
        ? "low"
        : remainingRatio < 0.25
          ? "warning"
          : "normal";

  return {
    loading: status.isPending || usage.isPending,
    usageLoading: usage.isPending,
    usageError: usage.isError,
    retryUsage: usage.refetch,
    status: status.data ?? null,
    usage: usage.data ?? null,
    planId: usage.data?.planId ?? status.data?.planId ?? "free",
    includedUsd,
    usedUsd,
    remainingUsd: usage.data?.remainingUsd ?? 0,
    percent,
    remainingPercent,
    state,
    segments: usage.data?.segments ?? [],
    nextResetAt: usage.data?.nextResetAt ?? null,
  };
}

/**
 * Rounding of the remaining % for display: never 100% as long as there is
 * consumption, never 0% as long as there is budget left — the two extremes are
 * reserved for true full and true empty (same idea as the floor at 1% of
 * detail lines).
 */
export function roundRemainingPercent(remainingPercent: number): number {
  const rounded = Math.round(remainingPercent);
  if (rounded === 100 && remainingPercent < 100) return 99;
  if (rounded === 0 && remainingPercent > 0) return 1;
  return rounded;
}

/**
 * Plan locks consumed by the UI (MIN-72, returns): agent access,
 * guest cap per project and project cap. Default PERMISSIVE as long as
 * that the billing charges (no “disabled” flash for paid plans — the
 * server remains the judge), hence the `null` = unlimited guests.
 */
export function usePlanGates() {
  const { loading, usage } = useBillingSummary();
  return {
    loading,
    agentsAllowed: usage?.limits.allowAgents ?? true,
    maxMembersPerProject: usage?.limits.maxMembersPerProject ?? null,
    projectLimitReached:
      usage != null &&
      usage.limits.maxProjects != null &&
      usage.limits.projectsUsed >= usage.limits.maxProjects,
  };
}

/**
 * % of monthly budget for a gross cost amount — the UI NEVER speaks in
 * USD (the internal cost is not the user's business), always in
 * percentage of the plan budget. Floor “<0.1” for micro-actions.
 */
export function formatBudgetPercent(
  usd: number,
  includedUsd: number,
  locale = "en",
): string {
  if (includedUsd <= 0 || usd <= 0) return "—";
  const percent = (usd / includedUsd) * 100;
  const format = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  if (percent < 0.1) return `<${format.format(0.001)}`;
  return format.format(usd / includedUsd);
}
