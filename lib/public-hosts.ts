/**
 * Détection des hosts « primaires » (MIN-36) : ceux qui servent l'app minddy
 * elle-même, par opposition aux domaines personnalisés des clients qui ne
 * servent qu'une page publique (board de feedback ou vue partagée).
 *
 * Module pur (pas de "server-only") : importé par proxy.ts (middleware) ET par
 * le code serveur classique — la logique doit être identique des deux côtés.
 */

/** Minuscules, sans port ni point final — la forme canonique stockée en base. */
export function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

/** Host attendu déjà normalisé (voir normalizeHost). */
export function isPrimaryHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  // Tout minddy.app (apex + sous-domaines actuels et futurs : www, preview…)
  if (host === "minddy.app" || host.endsWith(".minddy.app")) return true;
  // Déploiements Vercel (previews *.vercel.app).
  if (host.endsWith(".vercel.app")) return true;
  return false;
}
