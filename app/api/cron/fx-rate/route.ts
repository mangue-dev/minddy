import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { syncFxRates } from "@/lib/server/fx";

/**
 * Daily Cron (Vercel Cron, vercel.json): the USD→EUR rate of the day, written
 * in `fx_rates` so that the Finances page converts each cost at the rate of
 * ITS day (MIN-92).
 *
 * Scheduled AFTER 4 p.m. CET (`30 15 * * *` UTC): the ECB publishes once a day
 * worked around 4 p.m. CET, a morning cron would only bring back the rate of the day before.
 *
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}`; the road is
 * unusable without. A failed external call writes nothing and responds when
 * even 200: the last known rate is used, there is nothing to try again until tomorrow.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncFxRates();
  return NextResponse.json(result);
}
