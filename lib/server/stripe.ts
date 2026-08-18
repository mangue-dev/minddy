import "server-only";

import crypto from "node:crypto";
import { isManagedBillingEnabled } from "@/lib/managed-services";
import {
  coerceBillingPlanId,
  type BillingInterval,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Minimal Stripe client in raw fetch (no SDK), cloned from AutoKap.
 * Scope v1: monthly subscription checkout (Go / Pro), portal, reading
 * subscription, webhook signature verification. The price IDs come from
 * the env (`STRIPE_PRICE_ID_GO` / `STRIPE_PRICE_ID_PRO`) — the price charged is
 * that of the Stripe price, the amounts from lib/billing-plans.ts are the display.
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
  /** “Flexible” model (API ≥ 2025-03-31): the current period is carried
 * by the subscription item, plus by the root. */
  current_period_start?: number;
  current_period_end?: number;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  /** Fallback for older API versions (root-borne period). */
  current_period_start?: number;
  current_period_end?: number;
  items: { data: StripeSubscriptionItem[] };
  metadata?: Record<string, string>;
}

/**
 * A line of the LEDGER Stripe (MIN-92) — everything that has moved money on the
 * counts. Better source than charges alone for a finances page:
 * refunds and disputes are counted alone (negative lines,
 * `type: refund` / `adjustment`), and each line carries its `fee`, therefore the `net`
 * actually collected — a margin calculated on gross would be false.
 */
export interface StripeBalanceTransaction {
  id: string;
  /** `charge`, `refund`, `adjustment`, `payout`, `stripe_fee`… */
  type: string;
  /** Raw, in smallest unit (cents). Negative for a refund. */
  amount: number;
  /** Stripe commission charged on this line. */
  fee: number;
  /** `amount - fee`: what really lands on the account. */
  net: number;
  currency: string;
  created: number;
  description: string | null;
  /** Id of the original object (charge, refund…). Not expanded. */
  source?: string | null;
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
  return isManagedBillingEnabled();
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

/** Recognizes the monthly AND annual price IDs of a plan. */
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

/**
 * The CADENCE of a configured price. The counterpart of `getPlanIdForStripePrice`:
 * one says which plan, the other at what rate it is billed. Used by the page
 * Finances, which must spread an annual collection over twelve months and not over one.
 * `null` for an unknown price (promo, old price) — the caller decides.
 */
export function getIntervalForStripePrice(
  priceId: string | null | undefined
): BillingInterval | null {
  if (!priceId) return null;
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO_YEARLY ||
    priceId === process.env.STRIPE_PRICE_ID_PRO_YEARLY
  ) {
    return "year";
  }
  if (
    priceId === process.env.STRIPE_PRICE_ID_GO ||
    priceId === process.env.STRIPE_PRICE_ID_PRO
  ) {
    return "month";
  }
  return null;
}

export function coerceStripePlanId(value: unknown): BillingPlanId | null {
  return coerceBillingPlanId(value);
}

/**
 * An error by Stripe, with what Stripe says about it — not just its sentence.
 *
 * The message alone cannot be reread: `code` and `param` are what allow
 * to distinguish "this client does not exist" from a failure, and to repair rather than
 * to return a 500. Cf. `isMissingCustomerError`.
 */
export class StripeApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly param: string | null,
    readonly status: number
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

/**
 * Does the customer ID that we keep no longer designate anything?
 *
 * **It happens for real, and not just in development.** A customer
 * deleted from the Stripe dashboard, a key that changes account
 * Stripe (test → other test, test → live): the identifier remains written with us
 * and is no longer worth anything with them. Seen locally with a `cus_…` from an old test account
 * — the billing page returned a 500 on a simple click "upgrade
 * to the higher plan", while the right gesture is to redo a customer.
 */
export function isMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof StripeApiError &&
    error.code === "resource_missing" &&
    (error.param === "customer" || /No such customer/i.test(error.message))
  );
}

async function stripeRequest<T>(
  path: string,
  body?: URLSearchParams,
  /** Forced only where the verb is not deduced from the body (DELETE). */
  method?: "GET" | "POST" | "DELETE"
): Promise<T> {
  // The key alone never constitutes consent to use the Stripe account of
  // the operator. Routes already check this flag for their UI/HTTP, but
  // the adapter keeps its own boundary so that a new caller cannot
  // not introduce an implicit cost by forgetting this guard.
  if (!isStripeConfigured()) {
    throw new Error(
      "Managed Stripe billing is disabled or incomplete; enable MINDDY_MANAGED_BILLING=1 with the full Stripe configuration.",
    );
  }
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
  });

  const data = (await response.json()) as T & {
    error?: { message?: string; code?: string; param?: string };
  };
  if (!response.ok) {
    throw new StripeApiError(
      data.error?.message || `Stripe request failed: ${path}`,
      data.error?.code ?? null,
      data.error?.param ?? null,
      response.status
    );
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

/*
 * There was a `findStripeCustomerByEmail` here, which the checkout used to
 * “find” the customer of an account without a registered reference. Removed by
 * MIN-344, and not only from its caller: an address does not identify anyone
 * at Stripe, and attaching a minddy account to the first customer who carries the same
 * opened up the subscription, invoices and portal of another. The only authentic link
 * is `billing_accounts.stripe_customer_id`, written by us.
 */

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
  // metadata.user_id on the session AND the subscription: this is what allows the
  // webhook to attach the event to the minddy account without fragile lookup.
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

/**
 * IMMEDIATE termination of a subscription (MIN-119) — not `cancel_at_period_end`.
 *
 * Called when someone deletes their account: you cannot let a
 * subscription whose holder no longer exists, nor continue to charge a
 * person who left. The loss of the remaining period is assumed, it is
 * the user who chooses the moment.
 *
 * Stripe for its part keeps the invoicing documents for the duration of the obligation
 * accounting: termination stops the debit, it does not erase the history.
 */
export async function cancelStripeSubscription(
  subscriptionId: string
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`,
    undefined,
    "DELETE"
  );
}

/**
 * Termination at the END OF PERIOD, and its cancellation (MIN-296).
 *
 * This is the ordinary termination, the one that is triggered from the app: the
 * period already paid is due, we do not take it back — we stop the renewal.
 * Its opposite (`resume: true`) restarts the subscription until the date
 * has passed, and this is the half that makes the gesture safe: a
 * termination that cannot be undone anywhere other than Stripe is not a
 * reversible gesture.
 *
 * Not to be confused with `cancelStripeSubscription`, which cuts IMMEDIATELY —
 * this one is only called when the account is deleted, where there is no longer
 * anyone to whom the end of its period can be left.
 */
export async function setStripeCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean
): Promise<StripeSubscription> {
  const body = new URLSearchParams();
  body.set("cancel_at_period_end", cancel ? "true" : "false");
  return stripeRequest<StripeSubscription>(
    `/v1/subscriptions/${subscriptionId}`,
    body
  );
}

/** Beyond that, we stop paging. See the function comment. */
const BALANCE_TX_MAX_PAGES = 10;
const BALANCE_TX_PAGE_SIZE = 100;

/**
 * The ledger since a date (MIN-92). Each line has its `net` and its day:
 * this is all the Finances page needs, since a receipt is
 * displayed in full on the day it falls. (No `expand[]=data.source`: it was only used to find the customer to spread the amount over their period.)
 *
 * Pagination limited to 1,000 lines. This is not a bothersome limit today
 * (the count has two) but it is an explicit safeguard: the day the
 * volume touches it, it is precisely the signal that a mirror table
 * is needed rather than replaying the entire history on each page load.
 */
export async function listStripeBalanceTransactions(params: {
  since: Date;
}): Promise<{ transactions: StripeBalanceTransaction[]; truncated: boolean }> {
  const transactions: StripeBalanceTransaction[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < BALANCE_TX_MAX_PAGES; page++) {
    const query = new URLSearchParams();
    query.set("limit", String(BALANCE_TX_PAGE_SIZE));
    query.set("created[gte]", String(Math.floor(params.since.getTime() / 1000)));
    if (startingAfter) query.set("starting_after", startingAfter);

    const result: StripeList<StripeBalanceTransaction> & { has_more?: boolean } =
      await stripeRequest<StripeList<StripeBalanceTransaction> & { has_more?: boolean }>(
        `/v1/balance_transactions?${query.toString()}`
      );

    transactions.push(...result.data);
    if (!result.has_more || result.data.length === 0) {
      return { transactions, truncated: false };
    }
    startingAfter = result.data[result.data.length - 1].id;
  }

  return { transactions, truncated: true };
}

export function stripeUnixToIso(value: number | null | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

/**
 * Current billing period for a subscription. Since API 2025-03-31
 * (“flexible” billing), `current_period_*` is carried by the item, no longer by the
 * root — we read the item first, the root falls back for old accounts.
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

/** Verifies the `Stripe-Signature` signature (HMAC-SHA256, tolerance 300 s). */
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
