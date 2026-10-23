"use client";

// “Cited by” (MIN-279) connects a page to the pages, tickets, and objectives
// that depend on it. It lives at the top of the activity log: citations are
// context about the document, not part of its editable body. An empty result is
// deliberately absent, and both citation sources use the same presentation.

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

import { fetchPageBacklinksApi } from "@/lib/pages-api";
import { mentionNavigationTarget } from "@/lib/mention-target";
import { MentionChip } from "@/components/mention-chip";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { useIssuePanelActions } from "@/lib/issue-panel-context";
import { useOptionalPagePanelActions } from "@/lib/page-panel-context";
import type { PageBacklink } from "@/lib/types";
import {
  PAGE_ACTIVITY_FRESH_MS,
  pageBacklinksKey,
} from "@/lib/page-activity-cache";
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { pushPagesHistory } from "@/lib/pages-navigation";

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
    staleTime: PAGE_ACTIVITY_FRESH_MS,
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
      <ul className="flex flex-wrap gap-1.5 text-sm">
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
  const { openIssue } = useIssuePanelActions();
  const pagePanel = useOptionalPagePanelActions();
  const openDestination = useAppNavigation();
  const router = useAppRouter();
  const target = mentionNavigationTarget(item.kind, item.id, projectId);
  const title = item.title.trim() || t("untitled");

  // The pill of a mention, the one the citing text itself shows: a ticket by
  // its identifier (its title on hover), an objective and a page by name.
  return (
    <MentionChip
      type={item.kind}
      id={item.id}
      label={item.kind === "issue" && item.identifier ? item.identifier : title}
      tooltip={item.kind === "issue" && item.identifier ? title : null}
      color={item.kind === "objective" ? item.color : null}
      icon={item.kind === "page" ? item.icon : null}
      // A ticket and an objective show their status, as their mentions do.
      status={item.issueStatus ?? (item.status ? OBJECTIVE_STATUS_MAP[item.status].issueStatus : undefined)}
      href={target?.href ?? null}
      className="mx-0 max-w-full truncate align-top"
      onNavigate={() => {
        if (!target) return;
        if (target.kind === "issue-panel") {
          pagePanel?.closePage();
          openIssue(target.projectId, target.issueId);
        } else if (target.kind === "page-panel" && pagePanel) {
          pagePanel.openPage(target.projectId, target.pageId);
        } else if (item.kind === "page") {
          openDestination(target.href, () => pushPagesHistory(target.href));
        } else {
          router.push(target.href);
        }
      }}
    />
  );
}
