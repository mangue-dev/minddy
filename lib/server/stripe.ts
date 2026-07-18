import "server-only";

import crypto from "node:crypto";
import {
  coerceBillingPlanId,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Client Stripe minimal en fetch brut (pas de SDK), cloné d'AutoKap.
 * Périmètre v1 : checkout subscription mensuel (Go / Pro), portal, lecture
 * d'abonnement, vérification de signature webhook. Les price IDs viennent de
 * l'env (`STRIPE_PRICE_ID_GO` / `STRIPE_PRICE_ID_PRO`) — le prix facturé est
 * celui du price Stripe, les montants de lib/billing-plans.ts sont l'affichage.
 */

interface StripeList<T> {
  data: T[];
}

export interface StripeCustomer {
  id: string;
  email: string | null;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  metadata?: Record<string, string>;
}

export interface StripePortalSession {
  id: string;
  url: string;
}

export interface StripeSubscriptionItem {
  price: { id: string };
  /** Modèle « flexible » (API ≥ 2025-03-31) : la période courante est portée
   *  par l'item d'abonnement, plus par la racine. */
  current_period_start?: number;
  current_period_end?: number;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  /** Repli pour les anciennes versions d'API (période portée par la racine). */
  current_period_start?: number;
  current_period_end?: number;
  items: { data: StripeSubscriptionItem[] };
  metadata?: Record<string, string>;
}

export interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: T };
}

function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return key;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  return secret;
}

export function getStripePriceIdForPlan(
  planId: BillingPlanId,
  interval: BillingInterval = "month"
): string | null {
  const yearly = interval === "year";
  switch (planId) {
    case "go":
      return (
        (yearly ? process.env.STRIPE_PRICE_ID_GO_YEARLY : process.env.STRIPE_PRICE_ID_GO) ??
        null
      );
    case "pro":
      return (
        (yearly ? process.env.STRIPE_PRICE_ID_PRO_YEARLY : process.env.STRIPE_PRICE_ID_PRO) ??
        null
      );
    case "free":
      return null;
  }
}

/** Reconnaît les price IDs mensuels ET annuels d'un plan. */
export function getPlanIdForStripePrice(
  priceId: string | null | undefined
): BillingPlanId | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO ||
    priceId === process.env.STRIPE_PRICE_ID_GO_YEARLY
  ) {
    return "go";
  }
  if (
    priceId === process.env.STRIPE_PRICE_ID_PRO ||
    priceId === process.env.STRIPE_PRICE_ID_PRO_YEARLY
  ) {
    return "pro";
  }
  return null;
}

export function coerceStripePlanId(value: unknown): BillingPlanId | null {
  return coerceBillingPlanId(value);
}

async function stripeRequest<T>(
  path: string,
  body?: URLSearchParams
): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
  });

  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed: ${path}`);
  }
  return data as T;
}

export async function createStripeCustomer(params: {
  email?: string | null;
  userId: string;
}): Promise<StripeCustomer> {
  const body = new URLSearchParams();
  if (params.email) body.set("email", params.email);
  body.set("metadata[user_id]", params.userId);
  return stripeRequest<StripeCustomer>("/v1/customers", body);
}

export async function findStripeCustomerByEmail(
  email: string
): Promise<StripeCustomer | null> {
  const encoded = encodeURIComponent(`email:'${email.replaceAll("'", "\\'")}'`);
  const result = await stripeRequest<StripeList<StripeCustomer>>(
    `/v1/customers/search?query=${encoded}`
  );
  return result.data[0] ?? null;
}

export async function createStripeCheckoutSession(params: {
  customerId: string;
  planId: BillingPlanId;
  interval?: BillingInterval;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  const priceId = getStripePriceIdForPlan(params.planId, params.interval ?? "month");
  if (!priceId) {
    throw new Error(`Missing Stripe price for plan ${params.planId}`);
  }

  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", params.customerId);
  body.set("success_url", params.successUrl);
  body.set("cancel_url", params.cancelUrl);
  body.set("allow_promotion_codes", "true");
  body.set("client_reference_id", params.userId);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  // metadata.user_id sur la session ET l'abonnement : c'est ce qui permet au
  // webhook de rattacher l'événement au compte minddy sans lookup fragile.
  body.set("metadata[user_id]", params.userId);
  body.set("metadata[plan_id]", params.planId);
  body.set("subscription_data[metadata][user_id]", params.userId);
  body.set("subscription_data[metadata][plan_id]", params.planId);

  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", body);
}

export async function createStripePortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<StripePortalSession> {
  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);
  return stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", body);
}

export async function fetchStripeSubscription(
  subscriptionId: string
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`
  );
}

export function stripeUnixToIso(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

/**
 * Période de facturation courante d'un abonnement. Depuis l'API 2025-03-31
 * (billing « flexible »), `current_period_*` est porté par l'item, plus par la
 * racine — on lit l'item d'abord, la racine en repli pour les vieux comptes.
 */
export function getStripeSubscriptionPeriod(subscription: StripeSubscription): {
  start: number | null;
  end: number | null;
} {
  const item = subscription.items.data[0];
  return {
    start: item?.current_period_start ?? subscription.current_period_start ?? null,
    end: item?.current_period_end ?? subscription.current_period_end ?? null,
  };
}

function parseStripeSignature(header: string): {
  timestamp: string | null;
  signatures: string[];
} {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? null;
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  return { timestamp, signatures };
}

/** Vérifie la signature `Stripe-Signature` (HMAC-SHA256, tolérance 300 s). */
export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): StripeEvent {
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe-Signature header");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const isValid = signatures.some((signature) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  });
  if (!isValid) throw new Error("Invalid Stripe webhook signature");

  return JSON.parse(payload) as StripeEvent;
}
