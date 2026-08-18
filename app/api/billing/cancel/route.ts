import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getBillingAccountForUser,
  syncSubscriptionToBillingAccount,
} from "@/lib/server/billing-accounts";
import {
  isStripeConfigured,
  setStripeCancelAtPeriodEnd,
} from "@/lib/server/stripe";

/**
 * POST /api/billing/cancel — cancel (or resume) your subscription FROM
 * l'app (MIN-296).
 *
 * The “click-to-cancel” rule: canceling should not require more actions
 * what to subscribe. Subscribe, it's a button on /billing then payment;
 * canceling went through the Customer Portal, so a round trip to Stripe and
 * two more screens. This road gives the direct path — a button, a
 * confirmation.
 *
 * `{ resume: true }` does the opposite and this is what makes the gesture safe: as long as
 * the period runs, we go back from the same place. The Stripe portal
 * stays there for the rest (means of payment, invoices, change of formula).
 *
 * Termination is at the END OF THE PERIOD: what is paid remains due, we stop
 * renewal. The response returns the state written in base rather than waiting
 * the webhook — without it the screen would refresh to the old state.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  if (!isStripeConfigured()) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let resume = false;
  try {
    const body = (await request.json()) as { resume?: unknown };
    resume = body?.resume === true;
  } catch {
    // Absent or illegible body = termination, the only action that has a defect.
  }

  const account = await getBillingAccountForUser(auth.user.id);
  if (!account?.stripe_subscription_id) {
    return Response.json({ error: "No subscription" }, { status: 400 });
  }

  const subscription = await setStripeCancelAtPeriodEnd(
    account.stripe_subscription_id,
    !resume
  );
  await syncSubscriptionToBillingAccount(subscription);

  return Response.json({
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
