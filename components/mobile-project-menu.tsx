"use client";

import { useQuery } from "@tanstack/react-query";
import { issuesQueryFn } from "@/lib/issues-api";
import { feedbackQueryOptions } from "@/lib/feedback-query";
import { useRoutinesQuery } from "@/lib/use-routines-query";
import { useAllPullRequestsQuery } from "@/lib/use-agent-runs";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { File02Icon, Target01Icon, GitPullRequestIcon, BubbleChatDelayIcon, MessageMultiple01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";
import { dataIcon } from "@/components/icon";
import { MobileMenuRows, type MobileMenuNavigation, type MobileMenuPanel } from "@/components/mobile-navigation";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { usePagesQuery } from "@/lib/use-pages-query";

/** Only the project currently browsed by the sheet loads its resource lists. */
export function MobileProjectMenu({ projectId, kind, parentId, ...navigation }: {
  projectId: string;
  kind: "objectives" | "pages" | "triage" | "feedback";
  parentId?: string;
} & MobileMenuNavigation) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const tp = useTranslations("Pages");
  const to = useTranslations("Objectives");
  const { objectives, loading: objectivesLoading } = useObjectivesQuery(kind === "objectives" ? projectId : null);
  const { pages, loading: pagesLoading, error } = usePagesQuery(kind === "pages" ? projectId : null);
  const issues = useQuery({ queryKey: ["issues", projectId], queryFn: issuesQueryFn(projectId), enabled: kind === "triage" });
  const feedback = useQuery({ ...feedbackQueryOptions(projectId), enabled: kind === "feedback" });
  const resourceError = kind === "triage" ? issues.error : kind === "feedback" ? feedback.error : error;
  const base = `/projects/${projectId}`;
  const selectedPage = parentId ? pages.find((page) => page.id === parentId) : null;
  const pagePanel = (id: string, title: string): MobileMenuPanel => ({
    key: `page-${id}`, title,
    render: (next) => <MobileProjectMenu {...next} projectId={projectId} kind="pages" parentId={id} />,
  });
  const items = kind === "triage"
    ? (issues.data ?? []).filter((issue) => issue.status === "triage").map((issue) => ({ key: issue.id, label: issue.title, icon: dataIcon(Ticket01Icon), href: `${base}/triage?issue=${encodeURIComponent(issue.id)}` }))
    : kind === "feedback"
      ? (feedback.data?.posts ?? []).map((post) => ({ key: post.id, label: post.title, icon: dataIcon(MessageMultiple01Icon), href: `${base}/feedback?post=${encodeURIComponent(post.id)}` }))
    : kind === "objectives"
    ? objectives.map((objective) => ({ key: objective.id, label: objective.name, icon: dataIcon(Target01Icon), href: `${base}/objectives?open=${encodeURIComponent(objective.id)}` }))
    : pages.filter((page) => (page.parent_id ?? null) === (parentId ?? null)).map((page) => ({
      key: page.id, label: page.title || tp("untitled"), icon: dataIcon(File02Icon), href: `${base}/pages/${page.id}`,
      panel: pages.some((child) => child.parent_id === page.id) ? pagePanel(page.id, page.title || tp("untitled")) : undefined,
    }));
  return <>
    <MobileMenuRows {...navigation} sections={[{ items: [
      { key: "overview", label: selectedPage?.title || (kind === "objectives" ? to("emptyShowAll") : t(kind)), icon: dataIcon(kind === "objectives" ? Target01Icon : kind === "triage" ? Ticket01Icon : kind === "feedback" ? MessageMultiple01Icon : File02Icon), href: selectedPage ? `${base}/pages/${selectedPage.id}` : `${base}/${kind}` },
      ...items,
    ] }]} />
    {(objectivesLoading || pagesLoading || (kind === "triage" && issues.isPending) || (kind === "feedback" && feedback.isPending)) && <p role="status" className="px-3 text-sm text-muted-foreground">{tc("loading")}</p>}
    {resourceError && <p role="alert" className="px-3 text-sm text-destructive">{resourceError.message}</p>}
  </>;
}

/** Global secondary destinations also browse before choosing a final route. */
export function MobileRoutinesMenu(navigation: MobileMenuNavigation) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const { routines, loading } = useRoutinesQuery();
  return <>
    <MobileMenuRows {...navigation} sections={[{ items: [
      { key: "overview", label: t("routines"), icon: dataIcon(BubbleChatDelayIcon), href: "/routines" },
      ...routines.map((routine) => ({ key: routine.id, label: routine.title, icon: dataIcon(BubbleChatDelayIcon), href: `/routines?routine=${encodeURIComponent(routine.id)}` })),
    ] }]} />
    {loading && <p role="status" className="px-3 text-sm text-muted-foreground">{tc("loading")}</p>}
  </>;
}

export function MobilePullRequestsMenu(navigation: MobileMenuNavigation) {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const tp = useTranslations("PullRequests");
  const [limit, setLimit] = useState(40);
  const { pullRequests, loading, hasMore, loadingMore } = useAllPullRequestsQuery("open", limit);
  return <>
    <MobileMenuRows {...navigation} sections={[{ items: [
      { key: "overview", label: t("pullRequests"), icon: dataIcon(GitPullRequestIcon), href: "/pull-requests" },
      ...pullRequests.map((pr) => ({ key: pr.prId, label: pr.title || `#${pr.pr_number}`, icon: dataIcon(GitPullRequestIcon), href: `/pull-requests?pr=${encodeURIComponent(pr.prId)}` })),
    ] }]} />
    {hasMore && <button type="button" disabled={loadingMore} className="min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-control-hover" onClick={() => setLimit((previous) => previous + 40)}>{tp("loadMore")}</button>}
    {loading && <p role="status" className="px-3 text-sm text-muted-foreground">{tc("loading")}</p>}
  </>;
}
