import "server-only";

/**
 * IP du client pour le rate limiting des surfaces publiques.
 *
 * Le piège est dans `x-forwarded-for` : c'est une LISTE, et son entrée de
 * TÊTE est celle que l'appelant a envoyée. La lire, c'est laisser un client
 * choisir son propre compteur — un en-tête différent à chaque requête et la
 * limite ne limite plus rien.
 *
 * Ce qui est digne de foi, c'est ce qu'a écrit le dernier relais de confiance,
 * c'est-à-dire le nôtre :
 * - `x-vercel-forwarded-for` et `x-real-ip` sont posés par la plateforme et
 *   écrasent ce que le client aurait envoyé sous ces noms ;
 * - dans `x-forwarded-for`, l'entrée de QUEUE est celle qu'ajoute le relais le
 *   plus proche de nous ; les précédentes viennent de l'appelant.
 *
 * Fallback "unknown" : un bucket partagé vaut mieux que pas de limite.
 */
export function getClientIp(request: Request): string {
  return (
    lastHop(request.headers.get("x-vercel-forwarded-for")) ??
    lastHop(request.headers.get("x-real-ip")) ??
    lastHop(request.headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

/** Idem depuis un `Headers` déjà lu (server actions, `headers()`). */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    lastHop(headers.get("x-vercel-forwarded-for")) ??
    lastHop(headers.get("x-real-ip")) ??
    lastHop(headers.get("x-forwarded-for")) ??
    "unknown"
  );
}

function lastHop(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim() || null;
}
