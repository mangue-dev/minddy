/**
 * The browser's IANA time zone, remembered in a functional cookie so the
 * server can issue the same timezone-dependent reads the page will make
 * (`/api/me/board?tz=…`, `/api/me/cycle?tz=…`) while it renders the document
 * (MIN-880). The server only uses it to name those reads: a stale or missing
 * value makes the page read from the network, never with another zone.
 */
export const TIME_ZONE_COOKIE = "minddy-tz";

/** IANA names only: letters, digits, `/`, `_`, `+`, `-`. */
export function parseTimeZoneCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  let zone: string;
  try {
    zone = decodeURIComponent(value);
  } catch {
    return null;
  }
  return /^[A-Za-z0-9_+\-/]{1,64}$/.test(zone) ? zone : null;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Write the cookie when it is missing or out of date. */
export function rememberTimeZone(): void {
  if (typeof document === "undefined") return;
  const zone = currentTimeZone();
  const value = encodeURIComponent(zone);
  const existing = document.cookie.split("; ").find((part) => part.startsWith(`${TIME_ZONE_COOKIE}=`));
  if (existing === `${TIME_ZONE_COOKIE}=${value}`) return;
  document.cookie = `${TIME_ZONE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}
