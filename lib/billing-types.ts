import type {
  BillingPlanId,
  UsageSegmentId,
} from "@/lib/billing-plans";

/**
 * Formes de réponse des routes billing (MIN-72), partagées serveur/client.
 * `GET /api/billing` → BillingStatusResponse · `GET /api/billing/usage` →
 * UsageSummaryResponse.
 */

export interface BillingStatusResponse {
  planId: BillingPlanId;
  source: "admin_override" | "stripe" | "default";
  stripeConfigured: boolean;
  subscription: {
    status: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
}

export interface UsageSummaryResponse {
  planId: BillingPlanId;
  /** Budget d'usage mensuel inclus (USD, coût brut). */
  includedUsd: number;
  usedUsd: number;
  remainingUsd: number;
  periodStart: string;
  /** Fin de la fenêtre courante = date du prochain reset. */
  nextResetAt: string;
  /** Ventilation par segment d'affichage, dans l'ordre de USAGE_SEGMENTS. */
  segments: Array<{ id: UsageSegmentId; usd: number }>;
  limits: {
    maxProjects: number | null;
    projectsUsed: number;
    maxIssuesPerProject: number | null;
    allowAgents: boolean;
    allowMembers: boolean;
  };
}
