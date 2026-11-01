import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The brand mark as a CSS mask: the shimmer's gradient shows through it. */
const LOGO_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MINDDY_LOGO_VIEWBOX}"><path fill-rule="evenodd" clip-rule="evenodd" d="${MINDDY_LOGO_PATH}"/></svg>`,
)}")`;

/**
 * The full-page hand-off after a sign-in (MIN-882): the session is settled and
 * the app is about to land. Nothing but the brand mark, centered, in the
 * text color of the theme (black on light, white on dark), with the running
 * shimmer sweeping across it instead of a spinner (MIN-868);
 * `prefers-reduced-motion` keeps it still. The sentence is for screen
 * readers only.
 */
export function RedirectingScreen({
  label,
  className,
}: {
  /** What the screen announces, e.g. "Redirecting…". */
  label: string;
  /** Overrides the stacking layer when the screen covers another overlay. */
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("fixed inset-0 z-50 flex items-center justify-center bg-background", className)}
    >
      <span
        aria-hidden
        className="review-logo-shimmer size-12 bg-current text-foreground [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
        style={{ maskImage: LOGO_MASK, WebkitMaskImage: LOGO_MASK }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
