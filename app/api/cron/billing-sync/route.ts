import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  expireAdminOverrides,
  reconcileStripeBillingAccounts,
} from "@/lib/server/billing-accounts";

/**
 * Cron horaire (Vercel Cron, vercel.json) : reconciliation billing — re-tire
 * l'état réel des abonnements depuis Stripe pour rattraper tout webhook manqué
 * (renouvellement, changement de plan, annulation), en complément du re-sync
 * paresseux qui, lui, ne couvre que les users actifs. Vercel envoie
 * `Authorization: Bearer ${CRON_SECRET}` ; la route est inutilisable sans.
 *
 * Balaye au passage les plans OFFERTS arrivés à échéance. Le droit, lui, est
 * déjà tombé tout seul à la seconde près (la résolution ignore un override
 * expiré) : ce balayage ne fait que nettoyer les lignes.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Le nettoyage des cadeaux échus ne dépend pas de Stripe : il tourne même
  // quand Stripe n'est pas configuré, et un échec de reconciliation ne doit
  // pas l'emporter avec lui.
  const gifts = await expireAdminOverrides();
  const result = await reconcileStripeBillingAccounts();
  return NextResponse.json({ ok: true, ...result, expiredGifts: gifts.expired });
}
