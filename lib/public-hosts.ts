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

// Les hosts qui servent l'app elle-même ne sont JAMAIS allowlistables : une
// faute de frappe dans l'env ne doit pas pouvoir 404er toute la prod.
const NEVER_CUSTOM = new Set(["minddy.app", "www.minddy.app", "preview.minddy.app"]);

/**
 * Sous-domaines minddy.app explicitement autorisés comme domaines custom
 * (dogfooding : feedback.minddy.app). Contrôlé par l'ops via env — jamais par
 * les utilisateurs : *.minddy.app reste interdit à la revendication sinon.
 */
export function customDomainAllowlist(): Set<string> {
  const raw = process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((h) => normalizeHost(h))
      .filter((h) => h && !NEVER_CUSTOM.has(h) && !h.endsWith(".vercel.app"))
  );
}

/** Host attendu déjà normalisé (voir normalizeHost). */
export function isPrimaryHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  // Un host allowlisté est routé comme domaine custom malgré le suffixe minddy.
  if (customDomainAllowlist().has(host)) return false;
  // Tout minddy.app (apex + sous-domaines actuels et futurs : www, preview…)
  if (host === "minddy.app" || host.endsWith(".minddy.app")) return true;
  // Déploiements Vercel (previews *.vercel.app).
  if (host.endsWith(".vercel.app")) return true;
  return false;
}
