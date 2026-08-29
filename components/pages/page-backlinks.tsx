"use client";

// “Cited by” (MIN-279) connects a page to the pages, tickets, and objectives
// that depend on it. It lives at the top of the activity log: citations are
// context about the document, not part of its editable body. An empty result is
// deliberately absent, and both citation sources use the same presentation.

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Hash } from "lucide-react";
import { cn } from "mangue-ui";

import { fetchPageBacklinksApi } from "@/lib/pages-api";
import { mentionNavigationTarget } from "@/lib/mention-target";
import { EntityPill, PillIcon, PILL_INNER_RADIUS } from "@/components/entity-pill";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { useIssuePanel } from "@/lib/issue-panel-context";
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
  // Neither a skeleton nor an error message is useful here. Until citations are
  // known, the optional section stays absent, just like an empty result.
  if (items.length === 0) return null;

  return (
    <section className={cn("border-b border-border pb-4", className)}>
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
  const { openIssue } = useIssuePanel();
  const target = mentionNavigationTarget(item.kind, item.id, projectId);
  const href = target?.href ?? "#";
  const label = item.title.trim() || t("untitled");

  return (
    <Link
      href={href}
      className="block min-w-0 max-w-full"
      onClick={(event) => {
        if (
          target?.kind !== "issue-panel" ||
          !isPlainNavigationClick(event)
        ) {
          return;
        }
        event.preventDefault();
        openIssue(target.projectId, target.issueId);
      }}
    >
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
