import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { coerceBillingPlanId, type BillingInterval } from "@/lib/billing-plans";
import { billingReturnUrl } from "@/lib/desktop/return-url";
import {
  getBillingAccountForUser,
  shouldUseStripePlan,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  findStripeCustomerByEmail,
  getStripePriceIdForPlan,
  isStripeConfigured,
} from "@/lib/server/stripe";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 } as const;

/**
 * POST /api/billing/checkout — { planId: "go" | "pro" } → { url } de la session
 * Stripe Checkout (MIN-72). Un abonnement déjà actif → 409 : le changement de
 * plan passe par le portal.
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

  // Customer : réutilise celui du compte, sinon retrouve par email, sinon crée.
  let customerId = account?.stripe_customer_id ?? null;
  if (!customerId && user.email) {
    customerId = (await findStripeCustomerByEmail(user.email))?.id ?? null;
  }
  if (!customerId) {
    customerId = (
      await createStripeCustomer({ email: user.email, userId: user.id })
    ).id;
  }

  const origin = request.nextUrl.origin;
  // Le paiement s'ouvre dans le NAVIGATEUR même quand il part de l'app de
  // bureau (une page de carte bancaire n'a rien à faire dans une fenêtre à
  // nous). Sans ce rebond, il s'y terminait aussi : on repartait de Stripe vers
  // sa page de facturation dans Safari, l'app toujours ouverte derrière et
  // toujours sur l'ancien plan. Voir lib/desktop/open-link.ts.
  const fromDesktop = (body as { desktop?: unknown })?.desktop === true;
  const session = await createStripeCheckoutSession({
    customerId,
    planId,
    interval,
    userId: user.id,
    successUrl: billingReturnUrl(origin, "/billing?billing=success", fromDesktop),
    cancelUrl: billingReturnUrl(origin, "/billing?billing=cancelled", fromDesktop),
  });

  await upsertBillingAccount(user.id, {
    email: user.email ?? account?.email ?? null,
    stripe_customer_id: customerId,
    stripe_checkout_session_id: session.id,
  });

  return Response.json({ url: session.url });
}
