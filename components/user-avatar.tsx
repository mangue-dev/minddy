import { cn } from "mangue-ui";
import { avatarColor, initials } from "@/lib/avatar";

/**
 * Circular user avatar: the uploaded profile picture when available, else
 * deterministic colored initials. Size + text size come from `className`
 * (e.g. "size-6 text-[10px]").
 */
export function UserAvatar({
  url,
  name,
  seed,
  className,
  title,
}: {
  url?: string | null;
  name: string;
  seed: string;
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
  return (
    <span
      aria-hidden
      title={title}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className
      )}
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {initials(name)}
    </span>
  );
}
