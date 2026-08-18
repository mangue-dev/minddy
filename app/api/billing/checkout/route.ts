import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { coerceBillingPlanId, type BillingInterval } from "@/lib/billing-plans";
import { billingReturnUrl } from "@/lib/desktop/return-url";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import {
  getBillingAccountForUser,
  shouldUseStripePlan,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  getStripePriceIdForPlan,
  isMissingCustomerError,
  isStripeConfigured,
} from "@/lib/server/stripe";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;

/**
 * POST /api/billing/checkout — { planId: "go" | "pro" } → { url } of the session
 * Stripe Checkout (MIN-72). An already active subscription → 409: change of
 * plan goes through the portal.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  if (!isStripeConfigured()) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const rateLimit = checkSessionRateLimit(user.id, "billing-checkout", RATE_LIMIT);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests", retry_after: rateLimit.retryAfter },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const planId = coerceBillingPlanId((body as { planId?: unknown })?.planId);
  const interval: BillingInterval =
    (body as { interval?: unknown })?.interval === "year" ? "year" : "month";
  if (!planId || planId === "free" || !getStripePriceIdForPlan(planId, interval)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const account = await getBillingAccountForUser(user.id);
  if (
    account?.stripe_subscription_id &&
    shouldUseStripePlan(account.stripe_subscription_status)
  ) {
    return Response.json(
      { error: "Subscription already active — use the billing portal" },
      { status: 409 }
    );
  }

  /**
   * Customer: the one WE WROTE for this account, otherwise a new one. Never one
   * recherche par adresse (MIN-344).
   *
   * The email does not identify anyone at Stripe: nothing prevents two customers from
   * carry it, and above all nothing links the address of a minddy account to the customer
   * Stripe that carries it — an account that registers with the address of another
   * inherited HIS client, therefore his subscription, his invoices and the portal
   * who opens them. The only authentic link is the one we wrote ourselves
   * in `billing_accounts.stripe_customer_id`.
   */
  let customerId = account?.stripe_customer_id ?? null;
  if (!customerId) {
    customerId = (
      await createStripeCustomer({ email: user.email, userId: user.id })
    ).id;
  }

  const freshCustomer = async () =>
    (await createStripeCustomer({ email: user.email, userId: user.id })).id;

  const origin = canonicalAppOrigin();
  // The payment opens in the BROWSER even when it leaves the app
  // desktop (a bank card page has nothing to do in a window
  // nous). Sans ce rebond, il s'y terminait aussi : on repartait de Stripe vers
  // its billing page in Safari, the app always open behind and
  // still on the old plan. See lib/desktop/open-link.ts.
  const fromDesktop = (body as { desktop?: unknown })?.desktop === true;
  const openCheckout = (customer: string) =>
    createStripeCheckoutSession({
      customerId: customer,
      planId,
      interval,
      userId: user.id,
      successUrl: billingReturnUrl(origin, "/billing?billing=success", fromDesktop),
      cancelUrl: billingReturnUrl(origin, "/billing?billing=cancelled", fromDesktop),
    });

  /**
   * The customer ID that we keep may no longer designate anything at Stripe:
   * customer deleted from their dashboard, or key who changed account
   * Stripe. It then remains written here, and the call failed at 500 — “No such
   * customer” with a simple click “upgrade”.
   *
   * We do one again and we play again, once. There is no loss: checkout is not
   * only offered to an account WITHOUT an active subscription (the 409 above), there is no
   * so nothing to be found on the old client. Just one attempt and failure
   * next goes back: if the second client does not work either, it is no longer
   * an outdated reference is a failure, and hiding it serves no one.
   */
  let session;
  try {
    session = await openCheckout(customerId);
  } catch (error) {
    if (!isMissingCustomerError(error)) throw error;
    console.warn(`[billing] client Stripe périmé (${customerId}) — on en refait un`);
    customerId = await freshCustomer();
    session = await openCheckout(customerId);
  }

  await upsertBillingAccount(user.id, {
    email: user.email ?? account?.email ?? null,
    stripe_customer_id: customerId,
    stripe_checkout_session_id: session.id,
  });

  return Response.json({ url: session.url });
}
