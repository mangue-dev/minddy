import { cn } from "mangue-ui/lib/utils";
import { avatarDataUri } from "@/lib/avatar";
import { uploadedAvatarUrl } from "@/lib/avatar-source";
import { AppTooltip } from "@/components/ui/app-tooltip";

/**
 * Circular user avatar: a Lorelei portrait generated from `seed`, or the
 * imported account image encoded in that shared avatar source.
 * Size comes from `className` (e.g. "size-6").
 *
 * `url` remains available for external identities such as GitHub/GitLab
 * authors. Imported Minddy images travel through `seed` so the existing member,
 * inbox, mention, public-share, and activity payloads all resolve one source.
 *
 * A missing `seed` renders a neutral disc rather than a portrait: the seed is
 * fetched (`useMyAvatarSource`), and drawing one from a fallback value would flash
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
  shape = "circle",
}: {
  url?: string | null;
  seed: string | null | undefined;
  className?: string;
  title?: string;
  shape?: "circle" | "rounded";
}) {
  const importedUrl = uploadedAvatarUrl(seed);
  if (!url && !importedUrl && !seed) {
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 rounded-full bg-muted", className)}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  const avatar = (
    <img
      src={url || importedUrl || avatarDataUri(seed as string)}
      alt=""
      className={cn(
        "shrink-0 object-cover",
        shape === "rounded" ? "rounded-[6px]" : "rounded-full",
        className,
      )}
    />
  );
  return title ? <AppTooltip label={title}>{avatar}</AppTooltip> : avatar;
}
