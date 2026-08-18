import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  DEFAULT_BILLING_PLAN_ID,
  getBillingPlan,
  coerceBillingPlanId,
  type BillingInterval,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";
import {
  fetchStripeSubscription,
  getIntervalForStripePrice,
  getPlanIdForStripePrice,
  getStripeSubscriptionPeriod,
  coerceStripePlanId,
  isStripeConfigured,
  stripeUnixToIso,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/server/stripe";
import { isGiftExpired } from "@/lib/billing-gift";

/**
 * Billing accounts (MIN-72) — one `billing_accounts` line per user, written
 * only by customer service (Stripe webhook, checkout, sync). The effective
 * plan is never stored: it is resolved upon reading —
 * admin_override → Usable Stripe subscription → free.
 */

export interface BillingAccount {
  user_id: string;
  email: string | null;
  admin_override_plan_id: string | null;
  admin_override_note: string | null;
  /** Fin du plan offert par un admin — null = sans limite (lib/billing-gift.ts). */
  admin_override_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_plan_id: string | null;
  stripe_subscription_status: string | null;
  stripe_current_period_start: string | null;
  stripe_current_period_end: string | null;
  stripe_cancel_at_period_end: boolean;
  stripe_checkout_session_id: string | null;
  stripe_last_event_id: string | null;
  stripe_last_event_created: string | null;
  created_at: string;
  updated_at: string;
}

export type BillingPlanSource = "admin_override" | "stripe" | "default";

export interface ResolvedBilling {
  planId: BillingPlanId;
  plan: BillingPlan;
  source: BillingPlanSource;
  account: BillingAccount | null;
  stripeConfigured: boolean;
}

/** Stripe statuses that entitle you to the paid plan (past_due = grace). */
const STRIPE_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function shouldUseStripePlan(status: string | null | undefined): boolean {
  return !!status && STRIPE_ACTIVE_STATUSES.has(status);
}

/**
 * The still VALID admin override of this account, `null` as soon as the expiry date has passed.
 *
 * This is where the duration gift stops by itself: nothing needs
 * rewrite the line so that the right falls — reading is enough. The
 * scan (`expireAdminOverrides`) then cleans up, without changing anything in the
 * result.
 */
export function activeAdminOverride(
  account: BillingAccount | null,
  now: number = Date.now()
): BillingPlanId | null {
  const planId = coerceBillingPlanId(account?.admin_override_plan_id);
  if (!planId) return null;
  return isGiftExpired(account?.admin_override_expires_at, now) ? null : planId;
}

export function resolvePlanFromBillingAccount(
  account: BillingAccount | null,
  now: number = Date.now()
): {
  planId: BillingPlanId;
  source: BillingPlanSource;
} {
  const adminPlanId = activeAdminOverride(account, now);
  if (adminPlanId) return { planId: adminPlanId, source: "admin_override" };

  const stripePlanId = coerceBillingPlanId(account?.stripe_plan_id);
  if (stripePlanId && shouldUseStripePlan(account?.stripe_subscription_status)) {
    return { planId: stripePlanId, source: "stripe" };
  }

  return { planId: DEFAULT_BILLING_PLAN_ID, source: "default" };
}

/**
 * “How much does this account PAY?” » — not to be confused with
 * `resolvePlanFromBillingAccount`, which answers “what is he RIGHT TO?” .
 *
 * Two separate questions, hence two resolvers. An admin override gives
 * rights without generating a cent: it's a gift, never income. A free
 * account with a pro override therefore pays €0; a paid Go account with an override
 * pro pays Go. This resolver therefore IGNORES `admin_override_plan_id` and only reads
 * the real Stripe subscription.
 *
 * (On the graph the question does not even arise — the income comes from
 * balance transactions, and a gift produces no transactions. It is the theoretical MRR
 *, calculated from base subscriptions, that needs the rule.)
 */
export function resolvePaidPlanFromBillingAccount(
  account: BillingAccount | null
): { planId: BillingPlanId; interval: BillingInterval } | null {
  const stripePlanId = coerceBillingPlanId(account?.stripe_plan_id);
  if (!stripePlanId || stripePlanId === "free") return null;
  if (!shouldUseStripePlan(account?.stripe_subscription_status)) return null;
  return {
    planId: stripePlanId,
    // Price unknown (promo, old price) → monthly, the most
    // conservative: it does not inflate the MRR.
    interval: getIntervalForStripePrice(account?.stripe_price_id) ?? "month",
  };
}

export async function getBillingAccountForUser(
  userId: string
): Promise<BillingAccount | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("billing_accounts")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BillingAccount | null) ?? null;
}

export async function upsertBillingAccount(
  userId: string,
  updates: Partial<BillingAccount>
): Promise<BillingAccount> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("billing_accounts")
    .upsert(
      { user_id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as BillingAccount;
}

// ── Sync Stripe ──────────────────────────────────────────────────────────────

/**
 * Writes the status of a Stripe subscription to the account. User resolution:
 * metadata.user_id (set at checkout) → subscription id → customer id.
 * Shared by webhook and lazy re-sync.
 */
export async function syncSubscriptionToBillingAccount(
  subscription: StripeSubscription,
  event?: StripeEvent
): Promise<string> {
  const metadataUserId = subscription.metadata?.user_id ?? null;
  const userId =
    metadataUserId ??
    (await findUserIdForStripeIdentifiers({
      customerId: subscription.customer,
      subscriptionId: subscription.id,
    }));
  if (!userId) throw new Error("Unable to resolve user for Stripe subscription.");

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const stripePlanId =
    getPlanIdForStripePrice(priceId) ??
    coerceStripePlanId(subscription.metadata?.plan_id);
  const period = getStripeSubscriptionPeriod(subscription);

  await upsertBillingAccount(userId, {
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_plan_id: stripePlanId,
    stripe_subscription_status: subscription.status,
    stripe_current_period_start: stripeUnixToIso(period.start),
    stripe_current_period_end: stripeUnixToIso(period.end),
    stripe_cancel_at_period_end: subscription.cancel_at_period_end,
    ...(event
      ? {
          stripe_last_event_id: event.id,
          stripe_last_event_created: stripeUnixToIso(event.created),
        }
      : {}),
  });

  return userId;
}

export async function findUserIdForStripeIdentifiers(params: {
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  const service = getServiceClient();

  if (params.subscriptionId) {
    const { data } = await service
      .from("billing_accounts")
      .select("user_id")
      .eq("stripe_subscription_id", params.subscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (params.customerId) {
    const { data } = await service
      .from("billing_accounts")
      .select("user_id")
      .eq("stripe_customer_id", params.customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  return null;
}

/** Max age of Stripe data before API re-verification (net if webhook failed). */
const STRIPE_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isStripeSyncStale(account: BillingAccount | null): boolean {
  if (!account?.stripe_subscription_id) return false;
  if (!shouldUseStripePlan(account.stripe_subscription_status)) return false;
  // Period expired but status still active → the renewal webhook has
  // probably been missed; without re-sync the usage window would remain frozen.
  const periodEnd = account.stripe_current_period_end
    ? new Date(account.stripe_current_period_end).getTime()
    : 0;
  if (!periodEnd || periodEnd < Date.now()) return true;
  const lastSync = account.updated_at ? new Date(account.updated_at).getTime() : 0;
  return Date.now() - lastSync > STRIPE_SYNC_MAX_AGE_MS;
}

async function withStripeSync(
  account: BillingAccount | null
): Promise<BillingAccount | null> {
  if (!account || !isStripeConfigured() || !isStripeSyncStale(account)) {
    return account;
  }
  try {
    const subscription = await fetchStripeSubscription(
      account.stripe_subscription_id as string
    );
    await syncSubscriptionToBillingAccount(subscription);
    return await getBillingAccountForUser(account.user_id);
  } catch (err) {
    console.error("[billing] stripe re-sync failed:", (err as Error).message);
    // updated_at advanced so as not to retry each request for 24 hours.
    return upsertBillingAccount(account.user_id, {}).catch(() => account);
  }
}

// ── Entry point ───────────────────────────── ──────────────────────────────

/** A user's effective plan — the single server entry point. */
export async function getResolvedBilling(userId: string): Promise<ResolvedBilling> {
  const account = await withStripeSync(await getBillingAccountForUser(userId));
  const { planId, source } = resolvePlanFromBillingAccount(account);
  return {
    planId,
    plan: getBillingPlan(planId),
    source,
    account,
    stripeConfigured: isStripeConfigured(),
  };
}

// ── Fin des plans offerts ────────────────────────────────────────────────────

/**
 * Clears admin overrides whose deadline has passed.
 *
 * Does not cut ANYTHING: `activeAdminOverride` already ignores them from the second that
 * they expire, including quota. This scan is used so that the line stops
 * describing a gift that no longer exists — and, incidentally, the writing pushes
 * the change of plan to open tabs (the live listen
 * `billing_accounts`), which would otherwise keep the old badge until the next
 * loading.
 *
 * The note leaves with the plan: it said WHY we were giving a gift, it no longer has
 * any object once the gift is finished.
 */
export async function expireAdminOverrides(): Promise<{ expired: number }> {
  const service = getServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("billing_accounts")
    .update({
      admin_override_plan_id: null,
      admin_override_note: null,
      admin_override_expires_at: null,
      updated_at: nowIso,
    })
    .not("admin_override_expires_at", "is", null)
    .lte("admin_override_expires_at", nowIso)
    .select("user_id");
  if (error) throw new Error(error.message);
  return { expired: (data ?? []).length };
}

// ── Periodic reconciliation ──────────────────────── ────────────────────────

/**
 * Anti-drift net (cron, in addition to lazy re-sync): re-pulls the actual state
 * of each subscription from Stripe and rewrites it, independent of
 * webhooks. A missed event — renewal, change of plan, cancellation —
 * would otherwise be invisible to inactive users as reading never touches
 *. A canceled subscription naturally reverts to free via
 * `syncSubscriptionToBillingAccount` (status `canceled`). The most accounts
 * formerly synchronized first, in batches limited to fit within the budget
 * time of the function.
 */
export async function reconcileStripeBillingAccounts(options?: {
  limit?: number;
}): Promise<{ checked: number; synced: number; failed: number }> {
  if (!isStripeConfigured()) return { checked: 0, synced: 0, failed: 0 };

  const service = getServiceClient();
  const { data, error } = await service
    .from("billing_accounts")
    .select("stripe_subscription_id")
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(options?.limit ?? 500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ stripe_subscription_id: string }>;
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const subscription = await fetchStripeSubscription(row.stripe_subscription_id);
      await syncSubscriptionToBillingAccount(subscription);
      synced++;
    } catch (err) {
      failed++;
      console.error(
        `[billing] reconcile failed for ${row.stripe_subscription_id}:`,
        (err as Error).message
      );
    }
  }
  return { checked: rows.length, synced, failed };
}
