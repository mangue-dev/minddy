import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { fetchOpenRouterKeyStatus } from "@/lib/server/openrouter-key";
import { notifySpendGuard } from "@/lib/server/brrr";
import { getAppConfigValue, setAppConfigValue } from "@/lib/server/app-config";

/**
 * Cron HORAIRE (Vercel Cron, vercel.json) : le garde-fou de dépense (MIN-92).
 *
 * Ce qu'on surveille n'est pas le solde de crédits — l'auto-refill OpenRouter
 * s'en charge — mais le PLAFOND MENSUEL DE LA CLÉ minddy. L'atteindre coupe
 * Numo, la dictée et le traitement du feedback jusqu'au mois suivant.
 *
 * Horaire et pas quotidien : un emballement peut brûler le plafond en quelques
 * heures, un contrôle quotidien le découvrirait trop tard.
 *
 * Vercel envoie `Authorization: Bearer ${CRON_SECRET}` ; la route est
 * inutilisable sans.
 */

export const maxDuration = 60;

/** Seuil d'alerte, en pourcentage du plafond. */
const ALERT_THRESHOLD = 90;

/**
 * Mémoire de l'anti-répétition : `app_config[spend_alert_notified]` vaut
 * `YYYY-MM:<seuil>` (ex. `2026-07:90`).
 *
 * Sans elle, brrr pousserait une notification PAR HEURE pendant des jours : une
 * fois le seuil franchi, il le reste jusqu'au reset mensuel. On ne notifie donc
 * qu'au FRANCHISSEMENT, et le changement de mois réarme tout seul.
 */
const NOTIFIED_KEY = "spend_alert_notified";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = await fetchOpenRouterKeyStatus();

  // Pas de plafond posé sur la clé, ou clé illisible : rien à garder. On le dit
  // plutôt que de laisser croire que la surveillance tourne.
  if (!status || !status.limit || status.limit <= 0) {
    return NextResponse.json({ ok: true, skipped: status ? "no_limit" : "unreadable" });
  }

  const percent = Math.round((status.usage / status.limit) * 100);
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const marker = `${month}:${ALERT_THRESHOLD}`;
  const alreadyNotified = (await getAppConfigValue(NOTIFIED_KEY)) === marker;
  const crossed = percent >= ALERT_THRESHOLD;

  let notified = false;
  if (crossed && !alreadyNotified) {
    await notifySpendGuard({
      threshold: ALERT_THRESHOLD,
      percent,
      usageUsd: status.usage,
      limitUsd: status.limit,
    });
    // Écrit APRÈS l'envoi : si le push échoue, `sendBrrr` avale l'erreur et on
    // aura quand même marqué le mois — c'est le compromis assumé, une alerte
    // ratée vaut mieux qu'une alerte par heure.
    await setAppConfigValue(NOTIFIED_KEY, marker);
    notified = true;
  }

  return NextResponse.json({
    ok: true,
    percent,
    usage: status.usage,
    limit: status.limit,
    crossed,
    notified,
  });
}
