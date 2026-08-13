import { type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getBillingAccountForUser } from "@/lib/server/billing-accounts";
import { createStripePortalSession, isStripeConfigured } from "@/lib/server/stripe";
import { billingReturnUrl } from "@/lib/desktop/return-url";

/**
 * POST /api/billing/portal — { url } de la session Stripe Customer Portal
 * (MIN-72) : gérer/changer/annuler l'abonnement, moyens de paiement, factures.
 *
 * Corps FACULTATIF, `{ desktop?: true }` : le bouton « Retour » du portal doit
 * ramener dans l'app quand c'est d'elle qu'on est parti (MIN-293). Facultatif
 * pour de bon — la route a longtemps été appelée sans corps du tout, et un
 * `POST` sans `Content-Type` ne doit pas devenir un 400 pour un drapeau
 * d'ergonomie.
 */
/** `{ desktop: true }`, ou rien du tout — un corps absent ou illisible vaut « web ». */
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
  const session = await createStripePortalSession({
    customerId: account.stripe_customer_id,
    returnUrl: billingReturnUrl(request.nextUrl.origin, "/billing", fromDesktop),
  });
  return Response.json({ url: session.url });
}
