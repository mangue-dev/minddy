import { cn } from "mangue-ui/lib/utils";
import { avatarDataUri } from "@/lib/avatar";

/**
 * Circular user avatar: the portrait generated from `seed` (see lib/avatar.ts).
 * Size comes from `className` (e.g. "size-6").
 *
 * `url` is for identities that come with a real picture and aren't minddy
 * accounts — GitHub/GitLab authors on a pull request. minddy accounts have no
 * picture at all: their portrait is generated, and never uploaded.
 *
 * A missing `seed` renders a neutral disc rather than a portrait: the seed is
 * fetched (`useMyAvatarSeed`), and drawing one from a fallback value would flash
 * the WRONG face for a frame before the real one lands.
 *
 * The portrait is an `<img>` rather than inline SVG, and that is not a
 * preference: every DiceBear SVG carries the same fixed `viewboxMask` id, so two
 * of them in one document would share the first one's mask. An image is its own
 * document.
 */
export function UserAvatar({
  url,
  seed,
  className,
  title,
}: {
  url?: string | null;
  seed: string | null | undefined;
  className?: string;
  title?: string;
}) {
  if (!url && !seed) {
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 rounded-full bg-muted", className)}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url || avatarDataUri(seed as string)}
      alt=""
      title={title}
      className={cn("shrink-0 rounded-full object-cover", className)}
    />
  );
}
