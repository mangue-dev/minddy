import { cn } from "mangue-ui/lib/utils";
import { MINDDY_LOGO_PATH, MINDDY_LOGO_VIEWBOX } from "@/lib/brand";

/**
 * The minddy brandmark. The path is filled with `currentColor`, so the logo
 * inherits the surrounding text color — it renders dark on light themes and
 * light on dark themes without any extra wiring. Control the size/color via
 * `className` (e.g. `text-sidebar-foreground h-6`).
 */
export function MinddyLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MINDDY_LOGO_VIEWBOX}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="minddy"
      className={cn("h-6 w-auto", className)}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={MINDDY_LOGO_PATH}
      />
    </svg>
  );
}
