import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getBillingAccountForUser,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  createStripePortalSession,
  isMissingCustomerError,
  isStripeConfigured,
} from "@/lib/server/stripe";
import { billingReturnUrl } from "@/lib/desktop/return-url";
import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * POST /api/billing/portal — { url } of the Stripe Customer Portal session
 * (MIN-72): manage/change/cancel subscription, payment methods, invoices.
 *
 * OPTIONAL body, `{ desktop?: true }`: the “Return” button of the portal must
 * bring back into the app when it is from her that we left (MIN-293). Optional
 * for good — the road has long been called without a body at all, and a
 * `POST` without `Content-Type` should not become a 400 for a flag
 * d'ergonomie.
 */
/** `{ desktop: true }`, or nothing — an absent or unreadable body means “web”. */
async function readsDesktopFlag(request: NextRequest): Promise<boolean> {
  try {
    const body = (await request.json()) as { desktop?: unknown };
    return body?.desktop === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  if (!isStripeConfigured()) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const account = await getBillingAccountForUser(auth.user.id);
  if (!account?.stripe_customer_id) {
    return Response.json({ error: "No Stripe customer" }, { status: 400 });
  }

  const fromDesktop = await readsDesktopFlag(request);
  try {
    const session = await createStripePortalSession({
      customerId: account.stripe_customer_id,
      returnUrl: billingReturnUrl(canonicalAppOrigin(), "/billing", fromDesktop),
    });
    return Response.json({ url: session.url });
  } catch (error) {
    if (!isMissingCustomerError(error)) throw error;
    /**
     * The customer no longer exists at Stripe (deleted from the dashboard, or key
     * placed on another Stripe account). **We are NOT doing one again here** — at
     * opposite of checkout: the portal is used to manage a subscription, and a customer
     * brand new has none. We would open a blank screen promising the
     * contraire.
     *
     * We therefore erase the dead reference and return the same 400 as if the account
     * never had a client. This is what the app already knows how to deal with: it
     * then offers the checkout, which will make a customer again for good.
     */
    console.warn(
      `[billing] client Stripe périmé (${account.stripe_customer_id}) — référence effacée`
    );
    await upsertBillingAccount(auth.user.id, { stripe_customer_id: null });
    return Response.json({ error: "No Stripe customer" }, { status: 400 });
  }
}
