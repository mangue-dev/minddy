import { createElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The heading rules of a page whose content sits in a centred column
 * (MIN-983): the same placement, title size and spacing everywhere. The
 * objective page is the reference; billing, the routines home, Home, the
 * admin tabs, triage, feedback and pull requests follow it. Wiki pages and
 * databases keep their own document title.
 *
 * Placement: `PAGE_SCROLL` pads the page's scroll area, so the content starts
 * 24px under the header bar, with side gutters outside the content width
 * (`max-w-content`). Size: `PAGE_TITLE`, also for an editable title
 * (`title-field` textarea). Spacing: `PAGE_HEADING_GAP` between the title and
 * the text under it, a subtitle or a description.
 *
 * Class strings stay literal: Tailwind only generates what it reads.
 */
export const PAGE_SCROLL = "px-4 py-6 app-desktop:px-6";
export const PAGE_TITLE = "text-2xl leading-tight font-semibold";
export const PAGE_HEADING_GAP = "gap-4";
/** An editable page title: a `title-field` textarea at the page title size. */
export const PAGE_TITLE_FIELD =
  "w-full title-field bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50";

/** A page title and its optional subtitle, under the shared rules. */
export function PageHeading({
  title,
  description,
  as = "h1",
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** `h2` where the page already has its `h1` (a sidebar title, a hidden one). */
  as?: "h1" | "h2";
  id?: string;
  className?: string;
}) {
  return (
    <header id={id} className={cn("flex min-w-0 flex-col", PAGE_HEADING_GAP, className)}>
      {createElement(as, { className: cn("min-w-0 break-words", PAGE_TITLE) }, title)}
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
