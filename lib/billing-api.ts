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
import { isDesktop } from "@/lib/desktop/bridge";
import { trackEvent } from "./analytics";

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

/** Starts a Stripe checkout → Redirect URL. */
export async function createCheckoutApi(
  planId: BillingPlanId,
  interval: BillingInterval = "month"
): Promise<string> {
  trackEvent("checkout_started", { plan_id: planId, interval });
  const { url } = await parseJson<{ url: string | null }>(
    await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `desktop`: Stripe opens in the system browser in both cases,
      // but it must RETURN in the app when it is from it that we left
      // (MIN-293). Only the page can see this — the server would only see a
      // user agent, and a user agent doesn't decide anything here.
      body: JSON.stringify({ planId, interval, desktop: isDesktop() }),
    })
  );
  if (!url) throw new Error("Missing checkout URL");
  return url;
}

/**
 * Cancels the subscription at the end of the period, or resumes it (MIN-296) — without
 * leaving the app: this is what puts termination at the same number of gestures as
 * subscription.
 */
export async function setCancelAtPeriodEndApi(
  cancel: boolean
): Promise<boolean> {
  trackEvent(cancel ? "subscription_canceled" : "subscription_resumed", {});
  const { cancelAtPeriodEnd } = await parseJson<{ cancelAtPeriodEnd: boolean }>(
    await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: !cancel }),
    })
  );
  return cancelAtPeriodEnd;
}

/** Opens the Stripe portal (manage / change / cancel) → Redirect URL. */
export async function createPortalApi(): Promise<string> {
  trackEvent("billing_portal_opened", { current_plan_id: "unknown" });
  const { url } = await parseJson<{ url: string }>(
    await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The “Return” button of the Stripe portal, same story as the checkout.
      body: JSON.stringify({ desktop: isDesktop() }),
    })
  );
  return url;
}
