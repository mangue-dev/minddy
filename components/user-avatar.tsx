"use client";

import BoringAvatar from "boring-avatars";
import { cn } from "mangue-ui";
import { AVATAR_COLORS, AVATAR_VARIANT } from "@/lib/avatar";

/**
 * Circular user avatar: the deterministic mark generated from `seed` (see
 * lib/avatar.ts). Size comes from `className` (e.g. "size-6").
 *
 * `url` is for identities that come with a real picture and aren't minddy
 * accounts — GitHub/GitLab authors on a pull request. minddy accounts have no
 * picture at all: their mark is generated, and never uploaded.
 *
 * A missing `seed` renders a neutral disc rather than a mark: the seed is
 * fetched (`useMyAvatarSeed`), and drawing one from a fallback value would flash
 * the WRONG mark for a frame before the real one lands.
 *
 * `boring-avatars` calls `useId` for its clip mask, hence "use client" — the
 * component is a leaf, so the boundary costs nothing.
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
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        title={title}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  if (!seed) {
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 rounded-full bg-muted", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      title={title}
      className={cn("block shrink-0 overflow-hidden rounded-full", className)}
    >
      <BoringAvatar
        name={seed}
        variant={AVATAR_VARIANT}
        colors={AVATAR_COLORS}
        size="100%"
        // `block` sinon le SVG reste en ligne et son interligne le décale d'un
        // ou deux pixels dans la pastille.
        className="block"
      />
    </span>
  );
}
