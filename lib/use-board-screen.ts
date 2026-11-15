"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { afterFirstContentIdle } from "./first-content";
import { loadIssueSidePanel, preloadSurface } from "./lazy-app-surfaces";
import { useAppTabRoute } from "./app-tab-route-context";
import { useAppTabChange } from "./use-app-tab-change";
import { useAssistantPanelActions } from "./assistant-panel-context";
import type { Issue, View } from "./types";

export type IssuePanelTab = "description" | "plan";

/** What a kanban screen hands to its issue side panel. */
export interface BoardIssuePanel {
  /** The open issue as the panel or a deep link named it (id, `MIN-42` or
      short code); the screen resolves it against its own issues. */
  openIssueRef: string | null;
  tab: IssuePanelTab;
  /** Mounted once warmed up or first opened, then kept for its exit animation. */
  mounted: boolean;
  openIssue: (issue: Issue) => void;
  openIssueById: (id: string) => void;
  openPlan: (issue: Issue) => void;
  onOpenChange: (open: boolean) => void;
  /** Starts loading the panel's code before the first click, until it mounts. */
  onPointerEnter: (() => void) | undefined;
}

/**
 * The behavior the project board and the cross-project board share: the issue
 * side panel (its open state, the `?issue=` deep link, the idle warm-up) and
 * the views handed to Numo. `projectId` is null on the cross-project board.
 */
export function useBoardScreen({
  projectId,
  activeView,
  createViewAndSelect,
  beginGenerating,
}: {
  projectId: string | null;
  activeView: View | null;
  createViewAndSelect: (name: string) => Promise<View>;
  beginGenerating: (view: View) => void;
}) {
  const t = useTranslations("Board");
  const router = useRouter();
  const { pathname, searchParams } = useAppTabRoute();
  const issueParam = searchParams.get("issue");
  const { open: openAssistant } = useAssistantPanelActions();

  const [openIssueRef, setOpenIssueRef] = useState<string | null>(null);
  const [tab, setTab] = useState<IssuePanelTab>("description");
  const [mounted, setMounted] = useState(false);

  const show = useCallback((ref: string, nextTab: IssuePanelTab) => {
    setOpenIssueRef(ref);
    setTab(nextTab);
    setMounted(true);
  }, []);
  const openIssueById = useCallback((id: string) => show(id, "description"), [show]);
  const openIssue = useCallback((issue: Issue) => show(issue.id, "description"), [show]);
  const openPlan = useCallback((issue: Issue) => show(issue.id, "plan"), [show]);
  const onOpenChange = useCallback((next: boolean) => {
    if (next) return;
    setOpenIssueRef(null);
    // Strip the deep-link param so re-opening the same issue works.
    if (issueParam) router.replace(pathname);
  }, [issueParam, pathname, router]);

  useAppTabChange(() => setOpenIssueRef(null));

  // Deep link (Inbox, home cycle preview): `?issue=<ref>` opens that issue.
  useEffect(() => {
    if (issueParam) show(issueParam, "description");
  }, [issueParam, show]);

  // Mount the closed panel during idle time after the first content
  // (MIN-880), so its large hook tree and editor preload do not land on the
  // first card click. The transition stays interruptible if the user
  // interacts while the warm-up renders.
  useEffect(() => mounted ? undefined : afterFirstContentIdle(() => {
    preloadSurface(loadIssueSidePanel);
    startTransition(() => setMounted(true));
  }, 4_000, 2_000), [mounted]);

  const panel: BoardIssuePanel = useMemo(() => ({
    openIssueRef,
    tab,
    mounted,
    openIssue,
    openIssueById,
    openPlan,
    onOpenChange,
    onPointerEnter: mounted ? undefined : () => preloadSurface(loadIssueSidePanel),
  }), [openIssueRef, tab, mounted, openIssue, openIssueById, openPlan, onOpenChange]);

  // The views' context names the project on a project board only.
  const scope = projectId ? { projectId } : {};

  const handleCreateView = async (name: string, description?: string) => {
    const view = await createViewAndSelect(name);
    const wish = description?.trim();
    if (!wish) {
      toast.success(t("viewCreated", { name }));
      return;
    }
    // Numo fills in the new view's filters and sort from the description. It
    // edits this exact view (its id rides along), and the board adopts the
    // change once realtime brings the updated view back.
    beginGenerating(view);
    openAssistant({
      projectId,
      prompt: t("aiBuildViewPrompt", { name, description: wish }),
      pageContext: { ...scope, viewId: view.id, viewName: name },
    });
  };

  // The filters menu's "Create with Numo" (MIN-592): the agent with its view
  // tools proved more reliable than a classifier pass at picking filters. The
  // active view rides along so "this view" resolves; nothing typed opens the
  // composer on that same context.
  const handleAskAI = (wish: string) => {
    openAssistant({
      projectId,
      ...(wish ? { prompt: t("aiFilterPrompt", { wish }) } : { focusComposer: true }),
      pageContext: activeView
        ? { ...scope, viewId: activeView.id, viewName: activeView.name }
        : projectId ? scope : undefined,
    });
  };

  return { panel, handleCreateView, handleAskAI };
}
