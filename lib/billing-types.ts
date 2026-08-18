import type {
  BillingPlanId,
  UsageSegmentId,
} from "@/lib/billing-plans";
import type { UsageHistoryFeature } from "@/lib/usage-features";

/**
 * Response forms for billing routes (MIN-72), shared server/client.
 * `GET /api/billing` → BillingStatusResponse · `GET /api/billing/usage` →
 * UsageSummaryResponse.
 */

export interface BillingStatusResponse {
  planId: BillingPlanId;
  source: "admin_override" | "stripe" | "default";
  /** Stripe service actually operated by this instance. */
  managedBilling: boolean;
  /** AI quota actually operated by this instance. */
  managedAi: boolean;
  stripeConfigured: boolean;
  subscription: {
    status: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
}

export interface UsageHistoryEntry {
  runId: string;
  /** Display segment (agents = LLM + sandbox merged) — icon and color. */
  segmentId: UsageSegmentId;
  /**
 * The exact feature of the run, when we know how to name it: it is SHE that the line
 * displays (“Smart-fill”, not “Automations”). `null` on a feature
 * that the UI does not know — the display then falls back to the name of the segment.
 */
  feature: UsageHistoryFeature | null;
  at: string;
  projectName: string | null;
  /** Gross USD cost of the run — the UI converts it to a % of the budget, never displayed as is. */
  usd: number;
}

/** `GET /api/billing/usage-history` — runs of the current window, paginated. */
export interface UsageHistoryResponse {
  total: number;
  entries: UsageHistoryEntry[];
}

export interface UsageSummaryResponse {
  planId: BillingPlanId;
  managedBilling: boolean;
  managedAi: boolean;
  /** Monthly usage budget included (USD, gross cost). */
  includedUsd: number;
  usedUsd: number;
  remainingUsd: number;
  periodStart: string;
  /** End of current window = date of next reset. */
  nextResetAt: string;
  /** Breakdown by display segment, in order of USAGE_SEGMENTS. */
  segments: Array<{ id: UsageSegmentId; usd: number }>;
  limits: {
    maxProjects: number | null;
    projectsUsed: number;
    maxIssuesPerProject: number | null;
    allowAgents: boolean;
    /** Guests per project, owner not included. `null` = unlimited. */
    maxMembersPerProject: number | null;
  };
}
