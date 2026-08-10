import type {
  BillingPlanId,
  UsageSegmentId,
} from "@/lib/billing-plans";
import type { UsageHistoryFeature } from "@/lib/usage-features";

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

export interface UsageHistoryEntry {
  runId: string;
  /** Segment d'affichage (agents = LLM + sandbox fusionnés) — icône et couleur. */
  segmentId: UsageSegmentId;
  /**
   * La feature exacte du run, quand on sait la nommer : c'est ELLE que la ligne
   * affiche (« Smart-fill », pas « Automatisations »). `null` sur une feature
   * que l'UI ne connaît pas — l'affichage retombe alors sur le nom du segment.
   */
  feature: UsageHistoryFeature | null;
  at: string;
  projectName: string | null;
  /** Coût brut USD du run — l'UI le convertit en % du budget, jamais affiché tel quel. */
  usd: number;
}

/** `GET /api/billing/usage-history` — runs de la fenêtre courante, paginés. */
export interface UsageHistoryResponse {
  total: number;
  entries: UsageHistoryEntry[];
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
    /** Invités par projet, owner non compris. `null` = illimité. */
    maxMembersPerProject: number | null;
  };
}
