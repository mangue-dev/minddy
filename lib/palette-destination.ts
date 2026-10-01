import { normalizeAppTabLocation } from "./app-tab-location";

/** Keep exact entity destinations, while excluding commands tabs cannot replay. */
export function paletteDestinationHref(raw: string | undefined): string | null {
  const normalized = normalizeAppTabLocation(raw);
  if (!normalized || !raw) return null;
  const source = new URL(raw, "https://minddy.invalid");
  const destination = new URL(normalized, "https://minddy.invalid");
  if (source.pathname.replace(/\/$/, "") !== destination.pathname || source.hash !== destination.hash) return null;
  if ([...source.searchParams].some(([key, value]) => destination.searchParams.get(key) !== value)) return null;
  return normalized;
}
