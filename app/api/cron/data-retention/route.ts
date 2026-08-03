import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { runRetentionSweep } from "@/lib/server/retention";

/**
 * Cron nocturne (Vercel Cron, vercel.json) : applique les durées de conservation
 * annoncées par la politique de confidentialité (MIN-119, RGPD art. 5.1.e).
 *
 * Programmé à 3 h 45 UTC, à l'écart des autres crons : le balayage lit et écrit
 * sur des tables chaudes (notifications, événements d'agent) et n'a aucune
 * raison de le faire pendant que quelqu'un travaille.
 *
 * Vercel envoie `Authorization: Bearer ${CRON_SECRET}` ; la route est
 * inutilisable sans. Une étape en échec n'annule pas les autres : la réponse
 * porte le détail par étape, et `ok: false` signale qu'il faut aller voir.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runRetentionSweep();
  return NextResponse.json(result);
}
