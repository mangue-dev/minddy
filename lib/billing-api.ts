"use client";

import type {
  BillingStatusResponse,
  UsageHistoryResponse,
  UsageSummaryResponse,
} from "@/lib/billing-types";
import type {
  BillingInterval,
  BillingPlanId,
  UsageSegmentId,
} from "@/lib/billing-plans";

/** Fetchers client du billing (MIN-72) : statut de plan, usage, checkout, portal. */

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchBillingStatusApi(): Promise<BillingStatusResponse> {
  return parseJson(await fetch("/api/billing", { cache: "no-store" }));
}

export async function fetchBillingUsageApi(): Promise<UsageSummaryResponse> {
  return parseJson(await fetch("/api/billing/usage", { cache: "no-store" }));
}

export async function fetchUsageHistoryApi(params: {
  segment?: UsageSegmentId | null;
  offset?: number;
}): Promise<UsageHistoryResponse> {
  const search = new URLSearchParams();
  if (params.segment) search.set("segment", params.segment);
  if (params.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  return parseJson(
    await fetch(`/api/billing/usage-history${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    })
  );
}

/** Démarre un checkout Stripe → URL de redirection. */
export async function createCheckoutApi(
  planId: BillingPlanId,
  interval: BillingInterval = "month"
): Promise<string> {
  const { url } = await parseJson<{ url: string | null }>(
    await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, interval }),
    })
  );
  if (!url) throw new Error("Missing checkout URL");
  return url;
}

/** Ouvre le portal Stripe (gérer / changer / annuler) → URL de redirection. */
export async function createPortalApi(): Promise<string> {
  const { url } = await parseJson<{ url: string }>(
    await fetch("/api/billing/portal", { method: "POST" })
  );
  return url;
}
