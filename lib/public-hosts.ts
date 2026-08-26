/**
 * Detection of "primary" hosts (MIN-36): those which serve the minddy
 * app itself, as opposed to the clients' custom domains which only serve a public page (feedback board or shared view).
 *
 * Pure module (no "server-only"): imported by proxy.ts (middleware) AND by
 * classic server code — the logic must be identical on both sides.
 */

/** Lowercase, without a port or trailing dot — the canonical stored form. */
export function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

// Hosts that serve the app itself are NEVER allowlistable: a
// typo in the env must not be able to 404er the entire prod.
const NEVER_CUSTOM = new Set(["minddy.app", "www.minddy.app", "preview.minddy.app"]);

/** The operator-configured canonical hostname, if the public URL is valid. */
export function configuredPrimaryHost(): string | null {
  const raw = process.env.MINDDY_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    return normalizeHost(new URL(raw).hostname);
  } catch {
    // Runtime configuration reports the invalid URL separately. Host routing
    // stays deterministic and does not trust a malformed value here.
    return null;
  }
}

/**
 * Minddy.app subdomains explicitly allowed as custom
 * domains (dogfooding: feedback.minddy.app). Controlled by ops via env — never by
 * users: *.minddy.app remains forbidden to claim otherwise.
 */
export function customDomainAllowlist(): Set<string> {
  const raw = process.env.MDY_CUSTOM_DOMAIN_ALLOWLIST ?? "";
  const canonical = configuredPrimaryHost();
  return new Set(
    raw
      .split(",")
      .map((h) => normalizeHost(h))
      .filter(
        (h) =>
          h && h !== canonical && !NEVER_CUSTOM.has(h) && !h.endsWith(".vercel.app"),
      )
  );
}

/** Expected host already normalized (see normalizeHost). */
export function isPrimaryHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  // A self-hosted instance's configured origin serves the application. It is
  // checked before the allowlist so an ops typo cannot route the whole app to
  // a tenant lookup and turn every request into a 404.
  if (host === configuredPrimaryHost()) return true;
  // An allowlisted host is routed as a custom domain despite the minddy suffix.
  if (customDomainAllowlist().has(host)) return false;
  // All minddy.app (apex + current and future subdomains: www, preview…)
  if (host === "minddy.app" || host.endsWith(".minddy.app")) return true;
  // Vercel deployments (previews *.vercel.app).
  if (host.endsWith(".vercel.app")) return true;
  return false;
}
