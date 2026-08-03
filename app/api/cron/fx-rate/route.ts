import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { syncFxRates } from "@/lib/server/fx";

/**
 * Cron quotidien (Vercel Cron, vercel.json) : le taux USD→EUR du jour, écrit
 * dans `fx_rates` pour que la page Finances convertisse chaque coût au taux de
 * SA journée (MIN-92).
 *
 * Programmé APRÈS 16 h CET (`30 15 * * *` UTC) : la BCE publie une fois par jour
 * ouvré vers 16 h CET, un cron matinal ne ramènerait que le taux de la veille.
 *
 * Vercel envoie `Authorization: Bearer ${CRON_SECRET}` ; la route est
 * inutilisable sans. Un échec de l'appel externe n'écrit rien et répond quand
 * même 200 : le dernier taux connu sert, il n'y a rien à réessayer avant demain.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncFxRates();
  return NextResponse.json(result);
}
