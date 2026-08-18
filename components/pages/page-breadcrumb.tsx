"use client";

// The breadcrumbs of a SUB-PAGE (MIN-272).
//
// It only appears when there is something to say: a root page does not have
// path, and a breadcrumb that displays only one element is only one
// title written twice. As soon as there is a level of nesting, on the other hand, the
// question “where am I, and how do I get back up?” » really arises — the
// sidebar answers it, but it is collapsible and can be closed.
//
// It bears the ANCESTORS, and not the current page: its title is just in
// below, in 4xl. Write it a second time in small, two centimeters more
// high, says nothing more and takes the width that we are precisely trying not to
// prendre.
//
// When the chain lengthens, it is the MIDDLE levels which disappear, under
// a “…” which renders them all with one click. Never both ends: the root says
// in which document we are, the direct relative says where we come from, and these are
// the only two we need without thinking. This is the motive of Notion, of
// Motion and breadcrumbs of the app (components/app-breadcrumb.tsx), including
// this one takes the punctuation.

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import { FileText } from "lucide-react";
import { foldPath } from "@/lib/pages";

export interface BreadcrumbPage {
  id: string;
  title: string;
  icon: string | null;
}

function Crumb({
  page,
  href,
  className,
}: {
  page: BreadcrumbPage;
  href: string;
  className?: string;
}) {
  const t = useTranslations("Pages");
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded transition-colors hover:text-foreground",
        className
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-[11px] leading-none">
        {page.icon ?? <FileText className="size-3" />}
      </span>
      <span className="truncate">{page.title || t("untitled")}</span>
    </Link>
  );
}

function Separator() {
  return <span className="shrink-0 select-none text-muted-foreground/40">/</span>;
}

export function PageBreadcrumb({
  trail,
  hrefFor,
  className,
}: {
  /** Ancestors, from ROOT to direct parent. Empty: nothing is returned. */
  trail: BreadcrumbPage[];
  hrefFor: (pageId: string) => string;
  className?: string;
}) {
  const t = useTranslations("Pages");
  // The fallback rule lives in lib/pages.ts, along with the rest of the logic
  // tree: it can be tested without mounting a UI.
  const { lead, hidden, tail } = foldPath(trail);
  if (!lead) return null;

  return (
    <nav
      aria-label={t("breadcrumb")}
      // `text-xs` and `min-w-0` everywhere: this thread must be able to shrink up to
      // its ellipses rather than pushing the record indicator, to
      // the other end of the same line.
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <Crumb page={lead} href={hrefFor(lead.id)} className="max-w-[10rem]" />

      {hidden.length > 0 && (
        <>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("breadcrumbMore", { count: hidden.length })}
                className="shrink-0 rounded px-1 leading-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                …
              </button>
            </DropdownMenuTrigger>
            {/* The levels folded in the order of the path, from the root to
 here: this is the one we have in mind going up. */}
            <DropdownMenuContent align="start" className="w-56">
              {hidden.map((page) => (
                <DropdownMenuItem key={page.id} asChild>
                  <Link href={hrefFor(page.id)}>
                    <span className="flex size-4 shrink-0 items-center justify-center text-xs leading-none">
                      {page.icon ?? <FileText className="size-3.5" />}
                    </span>
                    <span className="truncate">{page.title || t("untitled")}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {tail.map((page) => (
        <span key={page.id} className="flex min-w-0 items-center gap-1.5">
          <Separator />
          <Crumb
            page={page}
            href={hrefFor(page.id)}
            className="max-w-[12rem] text-foreground/80"
          />
        </span>
      ))}
    </nav>
  );
}
