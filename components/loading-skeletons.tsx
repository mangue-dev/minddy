import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Small loading placeholders for regions inside a screen (MIN-868): a list in a
 * popover, a panel tab, a dialog body. Route-level skeletons live in
 * `components/route-skeletons.tsx`; these cover what loads after the route.
 *
 * A region that waits for content shows the shape of that content, never a
 * spinner. `Spinner` stays for the control that is working (a submit button).
 */

/**
 * Announces a loading region to assistive technology, as the spinner's
 * `role="status"` did, while the placeholders themselves stay silent.
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  /** What is loading; defaults to the generic "Loading…". */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Common");
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label ?? t("loading")}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

const LINE_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"];

/**
 * A list of rows while it loads: an optional leading avatar or icon, a line of
 * text, and optionally a shorter second line. Widths vary per row so the list
 * does not read as a solid block.
 */
export function RowsSkeleton({
  rows = 3,
  leading,
  secondLine = false,
  label,
  className,
  rowClassName,
}: {
  rows?: number;
  leading?: "avatar" | "avatar-sm" | "icon";
  secondLine?: boolean;
  label?: string;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn("flex items-center gap-3", rowClassName)}>
          {leading === "avatar" && <Skeleton className="size-8 shrink-0 rounded-full" />}
          {leading === "avatar-sm" && <Skeleton className="size-6 shrink-0 rounded-full" />}
          {leading === "icon" && <Skeleton className="size-4 shrink-0 rounded-sm" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", LINE_WIDTHS[index % LINE_WIDTHS.length])} />
            {secondLine && (
              <Skeleton className={cn("h-3", LINE_WIDTHS[(index + 2) % LINE_WIDTHS.length])} />
            )}
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Paragraph lines while a text body loads (a note, a document preview). */
export function TextLinesSkeleton({
  lines = 4,
  title = false,
  label,
  className,
}: {
  lines?: number;
  /** A heavier first line standing for the body's heading. */
  title?: boolean;
  label?: string;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-5/6", "w-3/4"];
  return (
    <LoadingRegion label={label} className={cn("flex flex-col gap-2.5", className)}>
      {title && <Skeleton className="mb-1.5 h-6 w-1/2" />}
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", widths[index % widths.length])} />
      ))}
    </LoadingRegion>
  );
}
