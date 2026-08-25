import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

/**
 * The default avatar of minddy.
 *
 * An account defaults to an opaque seed (`public.user_avatars`) whose portrait
 * is drawn here. The same seed produces the same portrait on every screen. An
 * imported image bypasses this generator in `components/user-avatar.tsx`, while
 * choosing a new Lorelei avatar replaces the seed and clears that image.
 *
 * The drawing comes from the `lorelei` style of DiceBear (CC0, Lisa Wischofsky): a
 * line face on a colored solid. It ONLY frames the head, which makes it
 * still readable at 22 px — where a bust shrinks to a blob. The rendering is in
 * `components/user-avatar.tsx`, the only place in the product that draws an avatar.
 */

/**
 * The funds, which DiceBear draws from according to the seed. A color wheel
 * in steps of approximately 24°, in the same vocabulary as the categories
 * (`lib/category-colors.ts`, Tailwind 500) but covering the entire circle.
 * Fifteen places: the longer the wheel, the fewer two accounts end up on
 * the same color. Without `#` — DiceBear wants bare hexadecimals.
 */
export const AVATAR_BACKGROUNDS = [
  "ef4444", // red
  "f97316", // orange
  "f59e0b", // amber
  "eab308", // yellow
  "84cc16", // lime
  "22c55e", // green
  "10b981", // emerald
  "14b8a6", // teal
  "06b6d4", // cyan
  "0ea5e9", // sky
  "3b82f6", // blue
  "6366f1", // indigo
  "8b5cf6", // violet
  "d946ef", // fuchsia
  "ec4899", // pink
];

/**
 * Portraits already calculated, per seed.
 *
 * Two reasons to keep this cache. First `createAvatar` rebuilds the whole
 * SVG on each call, and a board redraws the same people dozens of
 * times. Then the `<img>` then share the SAME string: the browser only
 * decodes one image, and the DOM only carries one more reference.
 *
 * Bulk purge beyond the ceiling: the number of people encountered in a
 * session is counted in tens, so we do not does not reach it — it is a safeguard
 * against a leak, not a cache policy to be refined.
 */
const portraits = new Map<string, string>();
const MAX_PORTRAITS = 500;

/** The portrait of a seed, in `data:` URI ready for a `<img>`. */
export function avatarDataUri(seed: string): string {
  const known = portraits.get(seed);
  if (known) return known;

  // Without the `size` option, the SVG only carries a `viewBox`: it therefore adapts to the
  // CSS size of the image, sharp at 16 px as at 64 px, and weighs less.
  const uri = createAvatar(lorelei, {
    seed,
    backgroundColor: AVATAR_BACKGROUNDS,
  }).toDataUri();

  if (portraits.size >= MAX_PORTRAITS) portraits.clear();
  portraits.set(seed, uri);
  return uri;
}
