import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import type { BillingStatusResponse } from "@/lib/billing-types";
import { managedServices } from "@/lib/managed-services";

/** GET /api/billing — effective plan + caller subscription status (MIN-72). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const billing = await getResolvedBilling(auth.user.id);
  const account = billing.account;
  const services = managedServices();

  const response: BillingStatusResponse = {
    planId: billing.planId,
    source: billing.source,
    managedBilling: services.billing,
    managedAi: services.ai,
    stripeConfigured: billing.stripeConfigured,
    subscription: account?.stripe_subscription_id
      ? {
          status: account.stripe_subscription_status,
          cancelAtPeriodEnd: account.stripe_cancel_at_period_end,
          currentPeriodEnd: account.stripe_current_period_end,
        }
      : null,
  };
  return Response.json(response);
}
