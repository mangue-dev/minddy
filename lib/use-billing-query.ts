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
  // La jauge se lit en RESTANT (100 → 0) ; `percent` (consommé) ne sert plus
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
    loading: status.isLoading || usage.isLoading,
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
 * Arrondi du % restant pour l'affichage : jamais 100 % tant qu'il reste de la
 * conso, jamais 0 % tant qu'il reste du budget — les deux extrêmes sont
 * réservés au vrai plein et au vrai vide (même idée que le plancher à 1 % des
 * lignes de détail).
 */
export function roundRemainingPercent(remainingPercent: number): number {
  const rounded = Math.round(remainingPercent);
  if (rounded === 100 && remainingPercent < 100) return 99;
  if (rounded === 0 && remainingPercent > 0) return 1;
  return rounded;
}

/**
 * Les deux verrous de plan consommés par l'UI (MIN-72, retours) : accès agents
 * et plafond de projets. Par défaut PERMISSIF tant que le billing charge (pas
 * de flash « désactivé » pour les plans payants — le serveur reste le juge).
 */
export function usePlanGates() {
  const { loading, usage } = useBillingSummary();
  return {
    loading,
    agentsAllowed: usage?.limits.allowAgents ?? true,
    projectLimitReached:
      usage != null &&
      usage.limits.maxProjects != null &&
      usage.limits.projectsUsed >= usage.limits.maxProjects,
  };
}

/**
 * % du budget mensuel pour un montant de coût brut — l'UI ne parle JAMAIS en
 * USD (le coût interne n'est pas l'affaire de l'utilisateur), toujours en
 * pourcentage du budget du plan. Plancher « <0.1 » pour les micro-actions.
 */
export function formatBudgetPercent(usd: number, includedUsd: number): string {
  if (includedUsd <= 0 || usd <= 0) return "—";
  const percent = (usd / includedUsd) * 100;
  if (percent < 0.1) return "<0.1%";
  if (percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}
