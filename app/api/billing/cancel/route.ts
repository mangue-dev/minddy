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
 * POST /api/billing/cancel — résilier (ou reprendre) son abonnement DEPUIS
 * l'app (MIN-296).
 *
 * La règle « click-to-cancel » : résilier ne doit pas demander plus de gestes
 * que souscrire. Souscrire, c'est un bouton sur /billing puis le paiement ;
 * résilier passait par le Customer Portal, donc un aller-retour chez Stripe et
 * deux écrans de plus. Cette route donne le chemin direct — un bouton, une
 * confirmation.
 *
 * `{ resume: true }` fait l'inverse et c'est ce qui rend le geste sûr : tant que
 * la période court, on revient en arrière du même endroit. Le portail Stripe
 * reste là pour le reste (moyen de paiement, factures, changement de formule).
 *
 * La résiliation est à la FIN DE PÉRIODE : ce qui est payé reste dû, on arrête
 * le renouvellement. La réponse renvoie l'état écrit en base plutôt que d'attendre
 * le webhook — sans ça l'écran se rafraîchirait sur l'ancien état.
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
    // Corps absent ou illisible = résiliation, la seule action qui a un défaut.
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
