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
  try {
    const session = await createStripePortalSession({
      customerId: account.stripe_customer_id,
      returnUrl: billingReturnUrl(canonicalAppOrigin(), "/billing", fromDesktop),
    });
    return Response.json({ url: session.url });
  } catch (error) {
    if (!isMissingCustomerError(error)) throw error;
    /**
     * Le client n'existe plus chez Stripe (supprimé au tableau de bord, ou clé
     * passée sur un autre compte Stripe). **On n'en refait PAS un ici** — au
     * contraire du checkout : le portal sert à gérer un abonnement, et un client
     * tout neuf n'en a aucun. On ouvrirait un écran vide en promettant le
     * contraire.
     *
     * On efface donc la référence morte et on rend le même 400 que si le compte
     * n'avait jamais eu de client. C'est ce que l'app sait déjà traiter : elle
     * propose alors le checkout, qui refera un client pour de bon.
     */
    console.warn(
      `[billing] client Stripe périmé (${account.stripe_customer_id}) — référence effacée`
    );
    await upsertBillingAccount(auth.user.id, { stripe_customer_id: null });
    return Response.json({ error: "No Stripe customer" }, { status: 400 });
  }
}
