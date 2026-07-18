import { NextResponse, type NextRequest } from "next/server";
import { reconcileStripeBillingAccounts } from "@/lib/server/billing-accounts";

/**
 * Cron horaire (Vercel Cron, vercel.json) : reconciliation billing — re-tire
 * l'état réel des abonnements depuis Stripe pour rattraper tout webhook manqué
 * (renouvellement, changement de plan, annulation), en complément du re-sync
 * paresseux qui, lui, ne couvre que les users actifs. Vercel envoie
 * `Authorization: Bearer ${CRON_SECRET}` ; la route est inutilisable sans.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await reconcileStripeBillingAccounts();
  return NextResponse.json({ ok: true, ...result });
}
