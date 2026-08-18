"use client";

// “Quoted by” (MIN-279) — which is based on this page.
//
// The gesture that takes you from a wiki to a network. A spec page says nothing
// of itself as long as we do not see the six tickets which quote it: “this
// spec, what is it used for? » is a question that arises AT THE MOMENT we ask it.
// reads, and the answer was so far not found in either direction.
//
// Three design decisions, and they stand:
//
// • AT THE FOOT OF THE DOCUMENT, not in another sidebar. It's a reading
// end of page — we go down, we finish, we ask “so what?” ". A piece of furniture
// permanent would steal width from the document for a response that we don't
// only watch once.
// • EMPTY = ABSENT. A frame that says “nothing cites this page” is a frame
// that we read on all the new pages of the wiki, for nothing.
// • THE TWO ORIGINS ARE NOT DISTINGUISHED. The server melts the resource
// (MIN-275) and the mention in a single line. Know which of the two has
// served is not a question we ask ourselves.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Hash } from "lucide-react";
import { cn } from "mangue-ui";

import { fetchPageBacklinksApi } from "@/lib/pages-api";
import { mentionTargetPath } from "@/lib/mention-target";
import { EntityPill, PillIcon, PILL_INNER_RADIUS } from "@/components/entity-pill";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import type { PageBacklink } from "@/lib/types";

/** The trackbacks cache key — the one that the real-time bridge invalidates. */
export const pageBacklinksKey = (pageId: string) =>
  ["page-backlinks", pageId] as const;

/** The shades of the two genres that have one, taken as is from Numo's
 context pills: a ticket is blue and an indigo page here like
 there. The objective wears ITS color (ObjectiveIconBadge). */
const TINT: Record<"issue" | "page", string> = {
  issue: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  page: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
};

export function PageBacklinks({
  projectId,
  pageId,
  className,
}: {
  projectId: string;
  pageId: string;
  className?: string;
}) {
  const t = useTranslations("Pages");

  const backlinks = useQuery({
    queryKey: pageBacklinksKey(pageId),
    queryFn: () => fetchPageBacklinksApi(projectId, pageId),
    // A trackback is born from a writing made ELSEWHERE — in a ticket, in a
    // other page. The cache from the previous time is therefore outdated by construction.
    refetchOnMount: "always",
    staleTime: 0,
  });

  const items = backlinks.data ?? [];
  // Neither skeleton nor error message: the panel is not what we came for
  // read. As long as we don't know, it doesn't exist - it's the same silence that
  // “nothing cites this page”, and that’s the right one.
  if (items.length === 0) return null;

  return (
    <section className={cn("mt-14 border-t border-border pt-6", className)}>
      <h2 className="mb-3 text-xs font-medium text-muted-foreground">
        {t("backlinksTitle", { count: items.length })}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="min-w-0 max-w-full">
            <BacklinkPill item={item} projectId={projectId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BacklinkPill({
  item,
  projectId,
}: {
  item: PageBacklink;
  projectId: string;
}) {
  const t = useTranslations("Pages");
  const href = mentionTargetPath(item.kind, item.id, projectId);
  const label = item.title.trim() || t("untitled");

  return (
    <Link href={href ?? "#"} className="block min-w-0 max-w-full">
      <EntityPill radius="md" className="hover:bg-accent">
        {item.kind === "objective" ? (
          <ObjectiveIconBadge
            color={item.color}
            className={cn("size-5 shrink-0", PILL_INNER_RADIUS.md)}
            iconClassName="h-3 w-3"
          />
        ) : (
          <PillIcon radius="md" tint={TINT[item.kind]}>
            {/* The emoji of a page when it has one — the same figure as in
 the sidebar tree, so that we recognize it. */}
            {item.kind === "page" && item.icon ? (
              <span className="text-[11px] leading-none">{item.icon}</span>
            ) : item.kind === "page" ? (
              <FileText className="h-3 w-3" />
            ) : (
              <Hash className="h-3 w-3" />
            )}
          </PillIcon>
        )}
        {/* The identifier in front of the title, like everywhere where a ticket is named:
, this is the one we look for in a list. */}
        {item.identifier ? (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {item.identifier}
          </span>
        ) : null}
        <span className="min-w-0 truncate font-medium text-foreground/80">
          {label}
        </span>
      </EntityPill>
    </Link>
  );
}
