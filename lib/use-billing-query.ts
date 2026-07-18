"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchBillingStatusApi,
  fetchBillingUsageApi,
} from "@/lib/billing-api";
import type { UsageSegmentId } from "@/lib/billing-plans";

export const billingStatusQueryKey = ["billing", "status"] as const;
export const billingUsageQueryKey = ["billing", "usage"] as const;

export type UsageState = "normal" | "warning" | "low" | "exhausted";

/**
 * View-model unique du billing côté client (MIN-72), partagé par la pastille
 * du header et l'onglet billing des settings pour que les deux surfaces ne
 * divergent jamais : plan, budget, dépensé, % consommé, état d'alerte et
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

  const state: UsageState =
    includedUsd > 0 && usedUsd >= includedUsd
      ? "exhausted"
      : remainingRatio < 0.1
        ? "low"
        : remainingRatio < 0.25
          ? "warning"
          : "normal";

  return {
    loading: status.isLoading || usage.isLoading,
    status: status.data ?? null,
    usage: usage.data ?? null,
    planId: usage.data?.planId ?? status.data?.planId ?? "free",
    includedUsd,
    usedUsd,
    remainingUsd: usage.data?.remainingUsd ?? 0,
    percent,
    state,
    segments: usage.data?.segments ?? [],
    nextResetAt: usage.data?.nextResetAt ?? null,
  };
}

/** Part (en % du budget) d'un segment — pour la barre et les lignes du détail. */
export function segmentPercent(
  segments: Array<{ id: UsageSegmentId; usd: number }>,
  includedUsd: number,
  id: UsageSegmentId
): number {
  if (includedUsd <= 0) return 0;
  const segment = segments.find((s) => s.id === id);
  return segment ? Math.min((segment.usd / includedUsd) * 100, 100) : 0;
}

/** Montant USD compact : "—" à 0, "<$0.01" sous le centime, sinon "$x.xx". */
export function formatUsd(value: number): string {
  if (value <= 0) return "—";
  if (value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}
