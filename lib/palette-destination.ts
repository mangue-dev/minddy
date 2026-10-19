import { normalizeAppTabLocation } from "./app-tab-location";
import { ONE_SHOT_SECTION_PARAM } from "./settings-section-focus";

/**
 * Keep exact entity destinations, while excluding commands tabs cannot replay.
 *
 * A settings `?section=` is the one parameter a tab may drop: the destination
 * still opens the right settings tab, and the palette hands the section to
 * the screen through lib/settings-section-focus.ts.
 */
export function paletteDestinationHref(raw: string | undefined): string | null {
  const normalized = normalizeAppTabLocation(raw);
  if (!normalized || !raw) return null;
  const source = new URL(raw, "https://minddy.invalid");
  const destination = new URL(normalized, "https://minddy.invalid");
  if (source.pathname.replace(/\/$/, "") !== destination.pathname || source.hash !== destination.hash) return null;
  if ([...source.searchParams].some(([key, value]) =>
    key !== ONE_SHOT_SECTION_PARAM && destination.searchParams.get(key) !== value,
  )) return null;
  return normalized;
}
