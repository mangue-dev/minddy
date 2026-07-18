import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  DEFAULT_BILLING_PLAN_ID,
  getBillingPlan,
  coerceBillingPlanId,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";
import {
  fetchStripeSubscription,
  getPlanIdForStripePrice,
  coerceStripePlanId,
  isStripeConfigured,
  stripeUnixToIso,
  type StripeEvent,
  type StripeSubscription,
} from "@/lib/server/stripe";

/**
 * Comptes billing (MIN-72) — une ligne `billing_accounts` par user, écrite
 * uniquement par le service client (webhook Stripe, checkout, sync). Le plan
 * effectif n'est jamais stocké : il est résolu à la lecture —
 * admin_override → abonnement Stripe utilisable → free.
 */

export interface BillingAccount {
  user_id: string;
  email: string | null;
  admin_override_plan_id: string | null;
  admin_override_note: string | null;
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

/** Statuts Stripe qui donnent droit au plan payant (past_due = grâce). */
const STRIPE_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function shouldUseStripePlan(status: string | null | undefined): boolean {
  return !!status && STRIPE_ACTIVE_STATUSES.has(status);
}

export function resolvePlanFromBillingAccount(account: BillingAccount | null): {
  planId: BillingPlanId;
  source: BillingPlanSource;
} {
  const adminPlanId = coerceBillingPlanId(account?.admin_override_plan_id);
  if (adminPlanId) return { planId: adminPlanId, source: "admin_override" };

  const stripePlanId = coerceBillingPlanId(account?.stripe_plan_id);
  if (stripePlanId && shouldUseStripePlan(account?.stripe_subscription_status)) {
    return { planId: stripePlanId, source: "stripe" };
  }

  return { planId: DEFAULT_BILLING_PLAN_ID, source: "default" };
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
 * Écrit l'état d'un abonnement Stripe dans le compte. Résolution du user :
 * metadata.user_id (posé au checkout) → subscription id → customer id.
 * Partagé par le webhook et le re-sync paresseux.
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

  await upsertBillingAccount(userId, {
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_plan_id: stripePlanId,
    stripe_subscription_status: subscription.status,
    stripe_current_period_start: stripeUnixToIso(subscription.current_period_start),
    stripe_current_period_end: stripeUnixToIso(subscription.current_period_end),
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

/** Âge max des données Stripe avant re-vérification API (filet si webhook raté). */
const STRIPE_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isStripeSyncStale(account: BillingAccount | null): boolean {
  if (!account?.stripe_subscription_id) return false;
  if (!shouldUseStripePlan(account.stripe_subscription_status)) return false;
  // Période échue mais statut encore actif → le webhook de renouvellement a
  // probablement été manqué ; sans re-sync la fenêtre d'usage resterait figée.
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
    // updated_at avancé pour ne pas re-tenter à chaque requête pendant 24 h.
    return upsertBillingAccount(account.user_id, {}).catch(() => account);
  }
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

/** Le plan effectif d'un user — l'unique point d'entrée serveur. */
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
