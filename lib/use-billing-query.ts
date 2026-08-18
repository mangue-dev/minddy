"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchBillingStatusApi,
  fetchBillingUsageApi,
} from "@/lib/billing-api";

export const billingStatusQueryKey = ["billing", "status"] as const;
export const billingUsageQueryKey = ["billing", "usage"] as const;

export type UsageState = "normal" | "warning" | "low" | "exhausted";

/**
 * Unique view-model of client-side billing (MIN-72), shared by the tablet
 * of the header and the billing tab of the settings so that the two surfaces do not
 * never diverge: plan, budget, spent, % consumed, alert status and
 * ventilation par segment.
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
  });

  const includedUsd = usage.data?.includedUsd ?? 0;
  const usedUsd = usage.data?.usedUsd ?? 0;
  const percent =
    includedUsd > 0 ? Math.min((usedUsd / includedUsd) * 100, 100) : 0;
  const remainingRatio = includedUsd > 0 ? 1 - usedUsd / includedUsd : 1;
  // The gauge reads REMAINING (100 → 0); `percent` (consumed) is no longer used
  // qu'aux calculs internes — ventilation par type, largeur des segments.
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
export function formatBudgetPercent(usd: number, includedUsd: number): string {
  if (includedUsd <= 0 || usd <= 0) return "—";
  const percent = (usd / includedUsd) * 100;
  if (percent < 0.1) return "<0.1%";
  if (percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}
