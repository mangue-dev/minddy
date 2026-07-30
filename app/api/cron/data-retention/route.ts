import { NextResponse, type NextRequest } from "next/server";
import { runRetentionSweep } from "@/lib/server/retention";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";

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
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await runRetentionSweep();
  const deleted = result.steps.reduce((n, s) => n + (s.deleted ?? 0), 0);

  captureServerEvent({
    distinctId: "cron",
    event: "cron_executed",
    properties: {
      job: "data-retention",
      duration_bucket: durationBucket(Date.now() - startedAt),
      ok: result.ok,
      deleted,
      failed_steps: result.steps.filter((s) => s.deleted === null).map((s) => s.step),
    },
  });

  return NextResponse.json(result);
}
