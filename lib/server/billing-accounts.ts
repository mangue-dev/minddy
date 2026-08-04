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

/** Statuts Stripe qui donnent droit au plan payant (past_due = grâce). */
const STRIPE_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function shouldUseStripePlan(status: string | null | undefined): boolean {
  return !!status && STRIPE_ACTIVE_STATUSES.has(status);
}

/**
 * L'override admin encore VALIDE de ce compte, `null` dès l'échéance passée.
 *
 * C'est ici que le cadeau à durée s'arrête tout seul : rien n'a besoin de
 * passer réécrire la ligne pour que le droit tombe — la lecture suffit. Le
 * balayage (`expireAdminOverrides`) nettoie ensuite, sans rien changer au
 * résultat.
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
 * « Combien ce compte PAIE-t-il ? » — à ne pas confondre avec
 * `resolvePlanFromBillingAccount`, qui répond à « à quoi a-t-il DROIT ? ».
 *
 * Deux questions distinctes, d'où deux résolveurs. Un override admin donne des
 * droits sans générer un centime : c'est un cadeau, jamais du revenu. Un compte
 * free avec un override pro paie donc 0 € ; un compte Go payant avec un override
 * pro paie Go. Ce résolveur IGNORE donc `admin_override_plan_id` et ne lit que
 * l'abonnement Stripe réel.
 *
 * (Sur le graphique la question ne se pose même pas — le revenu y vient des
 * balance transactions, et un cadeau ne produit aucune transaction. C'est le MRR
 * théorique, calculé à partir des abonnements en base, qui a besoin de la règle.)
 */
export function resolvePaidPlanFromBillingAccount(
  account: BillingAccount | null
): { planId: BillingPlanId; interval: BillingInterval } | null {
  const stripePlanId = coerceBillingPlanId(account?.stripe_plan_id);
  if (!stripePlanId || stripePlanId === "free") return null;
  if (!shouldUseStripePlan(account?.stripe_subscription_status)) return null;
  return {
    planId: stripePlanId,
    // Price inconnu (promo, ancien tarif) → mensuel, l'hypothèse la plus
    // conservatrice : elle ne gonfle pas le MRR.
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

// ── Fin des plans offerts ────────────────────────────────────────────────────

/**
 * Efface les overrides admin dont l'échéance est passée.
 *
 * Ne coupe RIEN : `activeAdminOverride` les ignore déjà depuis la seconde où
 * ils expirent, quota compris. Ce balayage sert à ce que la ligne arrête de
 * décrire un cadeau qui n'existe plus — et, accessoirement, l'écriture pousse
 * le changement de plan aux onglets ouverts (le direct écoute
 * `billing_accounts`), qui garderaient sinon l'ancien badge jusqu'au prochain
 * chargement.
 *
 * La note part avec le plan : elle disait POURQUOI on offrait, elle n'a plus
 * d'objet une fois le cadeau fini.
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

// ── Reconciliation périodique ────────────────────────────────────────────────

/**
 * Filet anti-dérive (cron, en plus du re-sync paresseux) : re-tire l'état réel
 * de chaque abonnement depuis Stripe et le ré-écrit, indépendamment des
 * webhooks. Un event manqué — renouvellement, changement de plan, annulation —
 * serait sinon invisible pour les users inactifs que la lecture ne touche
 * jamais. Un abonnement annulé repasse naturellement en free via
 * `syncSubscriptionToBillingAccount` (statut `canceled`). Les comptes les plus
 * anciennement synchronisés d'abord, par lot borné pour tenir dans le budget
 * temps de la fonction.
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
