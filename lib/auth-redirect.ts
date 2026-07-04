const DEFAULT_AUTH_REDIRECT = "/home";

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normalizes a `?redirect=`/`?next=` param into a safe internal path. Anything
 * that could escape the app (absolute URLs, protocol-relative `//`, backslashes,
 * control chars, `/x:` scheme-ish paths) falls back to /home.
 */
export function sanitizeInternalRedirectPath(
  raw: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT
): string {
  if (!raw) return fallback;

  let decoded = raw.trim();
  if (!decoded) return fallback;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("\\") || hasControlChar(decoded)) return fallback;
  if (/^\/[^/]*:/i.test(decoded)) return fallback;

  try {
    const parsed = new URL(decoded, "https://minddy.invalid");
    if (parsed.origin !== "https://minddy.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
