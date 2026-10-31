import { type NextRequest } from "next/server";
import { getAuthedUserAlongside } from "@/lib/server/api-auth";
import {
  getResolvedBilling,
  readBillingAccountRow,
  resolveBasePlanFromBillingAccount,
} from "@/lib/server/billing-accounts";
import type { BillingStatusResponse } from "@/lib/billing-types";
import { managedServices } from "@/lib/managed-services";

/** GET /api/billing — effective plan + caller subscription status (MIN-72). */
export async function GET(request: NextRequest) {
  // The account row is a side-effect-free read that overlaps the live session
  // check. Decoding and the Stripe re-sync, which may write, wait for it.
  const auth = await getAuthedUserAlongside(request, ({ user }) => readBillingAccountRow(user.id));
  if (!auth.ok) return auth.response;
  if ("error" in auth.alongside) throw auth.alongside.error;

  const billing = await getResolvedBilling(auth.user.id, auth.alongside.value);
  const account = billing.account;
  const services = managedServices();

  const response: BillingStatusResponse = {
    planId: billing.planId,
    source: billing.source,
    adminOverride:
      billing.source === "admin_override"
        ? {
            expiresAt: account?.admin_override_expires_at ?? null,
            basePlanId: resolveBasePlanFromBillingAccount(account).planId,
          }
        : null,
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
