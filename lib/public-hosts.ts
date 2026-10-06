/** Normalize an application hostname for routing. */
export function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "").replace(/:\d+$/, "");
}

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

/** Expected host already normalized (see normalizeHost). */
export function isPrimaryHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  if (host === configuredPrimaryHost()) return true;
  // All minddy.app (apex + current and future subdomains: www, preview…)
  if (host === "minddy.app" || host.endsWith(".minddy.app")) return true;
  // Vercel deployments (previews *.vercel.app).
  if (host.endsWith(".vercel.app")) return true;
  return false;
}
