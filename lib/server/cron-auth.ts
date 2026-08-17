import "server-only";

import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Garde des routes cron (MIN-118). Vercel envoie
 * `Authorization: Bearer ${CRON_SECRET}` ; sans secret déployé, la route est
 * inutilisable. La comparaison passe par `timingSafeEqual` — un `!==` sur le
 * header laisse la durée de la comparaison dépendre du préfixe fourni, ce qui
 * suffit en théorie à reconstruire le secret octet par octet.
 */
export function verifyCronSecret(request: NextRequest): boolean {
  // Le secret peut être généré en avance par le bootstrap. Il ne constitue pas
  // à lui seul le choix d'exécuter des jobs de fond.
  if (process.env.SCHEDULER_ENABLED?.trim() !== "1") return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}
