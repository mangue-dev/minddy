import type { ComponentProps } from "react";
import { cn } from "mangue-ui";

type AppContentHeaderProps = ComponentProps<"div"> & {
  contentClassName?: string;
};

/**
 * Sticky, fixed-height toolbar for the top of an application content pane.
 *
 * Its height is shared by the primary and secondary sidebar headers through
 * --app-content-header-height, initialized from APP_CONTENT_HEADER_HEIGHT.
 * It stays above the pane's scrolling content with an opaque surface.
 * Dense localized action sets stay on one line and remain horizontally
 * reachable instead of making the header taller than the surrounding chrome.
 */
export function AppContentHeader({
  className,
  contentClassName,
  children,
  ...props
}: AppContentHeaderProps) {
  return (
    <div
      className={cn(
        "app-content-header sticky top-0 z-[35] h-[var(--app-content-header-height)] shrink-0 overflow-x-auto overflow-y-hidden bg-background overscroll-x-contain",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex h-full min-w-full flex-nowrap items-center px-3.5",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
