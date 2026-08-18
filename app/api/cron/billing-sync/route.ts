import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  expireAdminOverrides,
  reconcileStripeBillingAccounts,
} from "@/lib/server/billing-accounts";

/**
 * Cron horaire (Vercel Cron, vercel.json) : reconciliation billing — re-tire
 * the actual status of subscriptions from Stripe to catch up on any missed webhook
 * (renewal, change of plan, cancellation), in addition to re-sync
 * lazy which only covers active users. Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` ; the road is unusable without it.
 *
 * Scan the OFFERED plans that have expired. The law is
 * already fell by itself to the nearest second (the resolution ignores an override
 * expired): This scan only cleans the lines.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Cleaning up expired gifts does not depend on Stripe: it even runs
  // when Stripe is not configured, and a reconciliation failure should not
  // not take it with him.
  const gifts = await expireAdminOverrides();
  const result = await reconcileStripeBillingAccounts();
  return NextResponse.json({ ok: true, ...result, expiredGifts: gifts.expired });
}
