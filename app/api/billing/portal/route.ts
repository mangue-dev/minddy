import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getBillingAccountForUser } from "@/lib/server/billing-accounts";
import { createStripePortalSession, isStripeConfigured } from "@/lib/server/stripe";

/**
 * POST /api/billing/portal — { url } de la session Stripe Customer Portal
 * (MIN-72) : gérer/changer/annuler l'abonnement, moyens de paiement, factures.
 */
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

  const session = await createStripePortalSession({
    customerId: account.stripe_customer_id,
    returnUrl: `${request.nextUrl.origin}/settings?tab=billing`,
  });
  return Response.json({ url: session.url });
}
