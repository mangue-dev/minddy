"use client";

import { expandParam } from "@/lib/ref-registry";
import { useCanonicalProjectUrl } from "@/lib/use-canonical-project-url";
import { issueHref, objectiveHref, pagePath, projectPath } from "@/lib/app-urls";
import { pageHref } from "@/lib/pages-navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ContentToaster } from "@/components/content-toaster";
import { Add01Icon, Alert01Icon, ArrowLeft01Icon, Clock01Icon as FileClock, Delete02Icon, File02Icon, GitPullRequestIcon, Home01Icon, InboxIcon } from "@hugeicons/core-free-icons";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { usePendingNavigation } from "@/lib/pending-navigation";
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AppShell, SkipToContentLink, requestMainFocusOnNavigation, useMainFocusOnNavigation } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { useRetainedWhileClosing } from "@/lib/use-retained-while-closing";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  AppIcon,
  dataIcon,
  type IconComponent,
} from "@/components/icon";
import { InboxPopover } from "@/components/inbox-popover";
import { MobileOpenPathListener } from "@/components/mobile/open-path-listener";
import { openInbox, openInboxAtNotification } from "@/lib/inbox-launcher";
import { buildWorkspaceGroups } from "@/lib/palette-workspace-groups";
import { useRoutinesQuery } from "@/lib/use-routines-query";
import { allPullRequestsQueryOptions } from "@/lib/use-agent-runs";
import { fetchViewsApi } from "@/lib/views-api";
import { useNotificationPlainText } from "@/lib/use-notification-text";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useHiddenProjects, visibleNavigationProjects } from "@/lib/use-hidden-projects";
import { useCreate } from "@/lib/create-context";
import { useNotifications } from "@/lib/use-notifications";
import { useMyInvitations } from "@/lib/use-invitations-query";
import { issuesQueryFn } from "@/lib/issues-api";
import { useSearchIndex } from "@/lib/use-search-index";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { usePaletteDataGroups, useWikiPageNavigation } from "@/lib/use-palette-data-groups";
import {
  useOpenPullRequestCountQuery,
} from "@/lib/use-agent-runs";
import { useSmartAssignWarningsQuery } from "@/lib/use-smart-assign-warnings-query";
import { useTriageCountsQuery, triageCountTotal, triageCountTotalAcross } from "@/lib/use-triage-counts-query";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  type PaletteGroup,
  type PaletteItem,
} from "@/components/header-search-pill";
import { usePlanGates } from "@/lib/use-billing-query";
import { useMobileLayout, useMobileViewport } from "@/lib/use-mobile-layout";
import { trackPressState } from "@/lib/press-state";
import { primeMobileKeyboard } from "@/lib/mobile-sheet-focus";
import { MobileProjectMenu, MobileRoutinesMenu, MobilePullRequestsMenu, MobileSettingsMenu } from "@/components/mobile-project-menu";
import { MobileNavigation, type MobileMenuSection, type MobileMenuPanel, type MobileMenuNavigation } from "@/components/mobile-navigation";
import { useAccountActions } from "@/components/mobile-account";
import { AppTopBar } from "@/components/app-top-bar";
import { AppTabPanel } from "@/components/app-tab-view-host";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { useAppTabChange } from "@/lib/use-app-tab-change";
import { HeaderWindowButtonsSlot } from "@/components/desktop-window-buttons";
import { projectOrbIcon } from "@/components/project-orb";
import { ProjectContextActionsProvider, useCreateProjectPage, useProjectContextActions } from "@/components/project-context-actions";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import {
  AppSidebar,
  EXPANDED_WIDTH,
  type AppNavItem,
  type AppNavReorder,
  type AppNavSection,
  type SidebarBackBadge,
} from "@/components/app-sidebar";
import { applyProjectOrder, moveProjectInOrder } from "@/lib/project-order";
import { useProjectOrder } from "@/lib/use-project-order";
import {
  HOME_BACK_NAV_KEY,
  projectIdFromNavKey,
  projectNavEntries,
  projectNavKey,
  type ProjectNavEntry,
  type ProjectNavLocation,
} from "@/components/project-nav-model";
import { projectChip, useShellCommandGroups } from "@/components/app-shell-palette-commands";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";
import { BOARD_ICON, ROUTINE_ICON } from "@/components/feature-icons";
import { useSidebarVisibility } from "@/lib/sidebar-visibility-context";
import { useCommandPaletteLauncher } from "@/lib/use-command-palette-launcher";
import type {
  Project,
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexPage,
} from "@/lib/types";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { objectiveIdFromBoardLocation } from "@/lib/objective-board-route";
import { draftIconUrl, draftOrbSeed } from "@/lib/project-draft";
import {
  useIssuePanelActions,
  useIssuePanelTarget,
} from "@/lib/issue-panel-context";
import {
  usePagePanelActions,
  usePagePanelTarget,
} from "@/lib/page-panel-context";
import {
  loadCommandPalette,
  loadGlobalIssuePanel,
  loadGlobalPagePanel,
  loadIssueSidePanel,
  loadScratchpadModal,
  preloadSurface,
} from "@/lib/lazy-app-surfaces";
import { afterFirstContentIdle } from "@/lib/first-content";

// The CSV export is deferred like the creation dialogs: a dialog that we
// opens from ⌘K a few times in the life of an account has nothing to do in the
// bundle for each page.
const ExportIssuesDialog = dynamic(
  () => import("@/components/export-issues-dialog").then((m) => m.ExportIssuesDialog),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => loadCommandPalette().then((m) => m.CommandPalette),
  { ssr: false },
);

const GlobalIssuePanel = dynamic(
  () => loadGlobalIssuePanel().then((module) => module.GlobalIssuePanel),
  { ssr: false },
);

const GlobalPagePanel = dynamic(
  () => loadGlobalPagePanel().then((module) => module.GlobalPagePanel),
  { ssr: false },
);

/** Keeps panel state updates out of the large app-shell render path. */
const GlobalIssuePanelHost = memo(function GlobalIssuePanelHost() {
  const liveTarget = useIssuePanelTarget();
  const target = useRetainedWhileClosing(liveTarget);
  const { closeIssue } = useIssuePanelActions();
  if (!target) return null;
  return (
    <GlobalIssuePanel
      key={`${target.projectId}:${target.issueId}`}
      projectId={target.projectId}
      issueId={target.issueId}
      open={liveTarget != null}
      onClose={closeIssue}
    />
  );
});

/** The page panel (MIN-777), mounted after the issue panel so a page opened
 * from an issue lies above it. */
const GlobalPagePanelHost = memo(function GlobalPagePanelHost() {
  const liveTarget = usePagePanelTarget();
  const target = useRetainedWhileClosing(liveTarget);
  const { closePage } = usePagePanelActions();
  if (!target) return null;
  return (
    <GlobalPagePanel
      key={`${target.projectId}:${target.pageId}`}
      projectId={target.projectId}
      pageId={target.pageId}
      open={liveTarget != null}
      onClose={closePage}
    />
  );
});

// The mobile menu renders nav/command icons itself as components, so
// Hugeicons icon DATA must be bridged into components at that boundary only.
function menuIcon(icon: AppIcon): IconComponent {
  return Array.isArray(icon) ? dataIcon(icon) : (icon as IconComponent);
}


function toMenuSections(sections: AppNavSection[]): MobileMenuSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      icon: item.icon ? menuIcon(item.icon) : undefined,
    })),
  }));
}

// The emoji of a wiki page, in the icon slot of the palette (MIN-270).
// Cached by emoji: the slot receives a COMPONENT, and making a new one each
// time it is rendered would remount it.
const emojiIconCache = new Map<string, ComponentType<{ className?: string }>>();

function emojiIcon(emoji: string): ComponentType<{ className?: string }> {
  const cached = emojiIconCache.get(emoji);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <span
      className={cn("flex items-center justify-center text-sm leading-none", className)}
      aria-hidden
    >
      {emoji}
    </span>
  );
  Icon.displayName = `EmojiIcon(${emoji})`;
  emojiIconCache.set(emoji, Icon);
  return Icon;
}

import { countBadge, countBadges } from "@/components/nav-badge";
import { NotificationBadge, UnreadCountAnnouncer } from "@/components/notification-badge";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { GLOBAL_VIEWS_KEY, issuesKey, viewsKey } from "@/lib/query-keys";

/**
 * The mark of a draft project, in the exact place of the “to sort” counter
 * of a created project: this is the only point where the line differs, and the void there
 * would suggest a project without anything to sort.
 */
function draftBadge(label: string) {
  return <AppIcon icon={FileClock} className="size-3.5 text-muted-foreground" aria-label={label} />;
}

/** A project tab's counter, or nothing when it has none. */
function navEntryBadge(entry: ProjectNavEntry, t: ReturnType<typeof useTranslations<"Nav">>) {
  return entry.badge
    ? countBadge(entry.badge.count, t(entry.badge.labelKey, { count: entry.badge.count }))
    : undefined;
}

/** Muted monospace identifier badge, e.g. "MIND-42". */
function identifierBadge(id: string) {
  return (
    <span className="font-mono text-[0.7rem] font-medium tabular-nums text-muted-foreground/70">
      {id}
    </span>
  );
}

/** Activation closes transient surfaces without rendering the whole shell. */
function AppTabChangeEffect({ onChange }: { onChange: () => void }) {
  useAppTabChange(onChange);
  return null;
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  useMobileViewport({ pinDocument: true });
  useCanonicalProjectUrl();
  // A held control shows it is pressed (lib/press-state.ts).
  useEffect(() => trackPressState(), []);
  // A root marker keeps application typography scoped without repeatedly
  // matching relational :has() selectors against the entire workspace DOM.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-app-shell");
    root.setAttribute("data-app-shell", "true");
    return () => {
      if (previous === null) root.removeAttribute("data-app-shell");
      else root.setAttribute("data-app-shell", previous);
    };
  }, []);
  const t = useTranslations("Nav");
  const ti = useTranslations("Issue");
  const tRoutines = useTranslations("Routines");
  const tBilling = useTranslations("Billing");
  const tProjects = useTranslations("Projects");
  const tPages = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const notificationPlainText = useNotificationPlainText();
  const { agentsAllowed, projectLimitReached } = usePlanGates();
  // The sidebar selects a pending destination before the router commits it
  // (MIN-843), so it follows the shown location rather than the committed one.
  const pendingNavigation = usePendingNavigation();
  const routePathname = usePathname();
  const pathname = pendingNavigation?.pathname ?? routePathname;
  // The stable session: activation re-renders only the tab panel below.
  const appTabSession = useOptionalAppTabSession();
  const routeSearchParams = useSearchParams();
  const pendingSearch = pendingNavigation?.search;
  const searchParams = useMemo(
    () => pendingSearch === undefined ? routeSearchParams : new URLSearchParams(pendingSearch),
    [pendingSearch, routeSearchParams],
  );
  const router = useAppRouter();
  const openDestination = useAppNavigation();
  const { user } = useAuth();
  const {
    projects,
    openCreateProject,
    projectDrafts,
    openProjectDraft,
    deleteProjectDraft,
  } = useProjects();
  const { openCreateIssue } = useCreate();
  const { notifications, unreadCount } = useNotifications();
  const {
    openIssue: openIssuePanel,
    closeIssue: closeIssuePanel,
  } = useIssuePanelActions();
  const { closePage: closePagePanel } = usePagePanelActions();
  const closeTransientPanels = useCallback(() => {
    closeIssuePanel();
    closePagePanel();
  }, [closeIssuePanel, closePagePanel]);
  useMainFocusOnNavigation(routePathname);
  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) closeTransientPanels();
    previousPathname.current = pathname;
  }, [pathname, closeTransientPanels]);
  // The inbox badge also counts pending invitations: they are there
  // display, and nothing else reports them once you leave the home.
  const { invitations } = useMyInvitations();
  const inboxCount = unreadCount + invitations.length;
  const navigateToWikiPage = useWikiPageNavigation(pathname, router, openDestination);
  const { hidden: sidebarHidden } = useSidebarVisibility();
  const mobileLayout = useMobileLayout() === true;

  // Command palette open state — shared by the header search pill and the
  // lightweight global shortcut launcher. The full palette mounts on demand.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"default" | "destination">(
    "default",
  );
  const warmPalette = useCallback(() => {
    preloadSurface(loadCommandPalette);
    startTransition(() => setPaletteMounted(true));
  }, []);

  // Build the large palette item model off the interaction path. A transition
  // lets React yield while thousands of cross-project rows are mapped.
  // Idle starts only after the first content (MIN-880): on a cold load the
  // main thread idles while the reads are in flight.
  useEffect(() => afterFirstContentIdle(() => warmPalette(), 3_000, 1_500), [warmPalette]);

  // These surfaces are less frequent, so preload their code after the palette.
  // Pointer intent below still starts the scratchpad immediately when needed.
  useEffect(() => afterFirstContentIdle(() => {
    preloadSurface(loadGlobalIssuePanel);
    preloadSurface(loadIssueSidePanel);
    preloadSurface(loadScratchpadModal);
  }, 5_000, 2_500), []);

  // Does the page have a secondary sidebar? The mounting of the bar is
  // correct answer; the road gives the same before hydration, where nothing is
  // still mounted (see routeHasSecondaryNav). Without it, the server's HTML
  // would leave primary sidebar unfolded and full width content, for all
  // reorganize suddenly for hydration.
  const currentProjectId = projectIdFromPath(pathname);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  // Projects I hid (MIN-692) leave the home panel's list. The switchers keep
  // the project on screen so they can still say where I am; leaving it does
  // not bring it back.
  const { hiddenProjectIds } = useHiddenProjects();
  // Both lists follow the order I gave my projects by dragging them (MIN-968).
  const { order: projectOrder, setOrder: setProjectOrder } = useProjectOrder();
  const orderedProjects = useMemo(
    () => applyProjectOrder(projects, projectOrder),
    [projects, projectOrder]
  );
  const listedProjects = useMemo(
    () => visibleNavigationProjects(orderedProjects, hiddenProjectIds),
    [orderedProjects, hiddenProjectIds]
  );
  const switcherProjects = useMemo(
    () => visibleNavigationProjects(orderedProjects, hiddenProjectIds, currentProjectId),
    [orderedProjects, hiddenProjectIds, currentProjectId]
  );
  const tDrag = useTranslations("DragAnnouncements");
  const projectReorder = useMemo<AppNavReorder>(() => ({
    keys: listedProjects.map((p) => projectNavKey(p.id)),
    onMove: (activeKey, overKey) => {
      const activeId = projectIdFromNavKey(activeKey);
      const overId = projectIdFromNavKey(overKey);
      const next = activeId && overId ? moveProjectInOrder(projects, projectOrder, activeId, overId) : null;
      if (next) void setProjectOrder(next);
    },
    instructions: tDrag("projectInstructions"),
  }), [listedProjects, projects, projectOrder, setProjectOrder, tDrag]);
  // ⌘K resolves every row through the projects it may show (MIN-751): the
  // pages, tickets and objectives of a hidden project stay out of the palette,
  // index and content search alike, unless it is the project on screen.
  const paletteProjectById = useMemo(
    () => new Map(switcherProjects.map((p) => [p.id, p])),
    [switcherProjects]
  );
  // CSV export: only one pallet line, never per project — this is the
  // dialogue which requires scope, because “one project or all” is precisely
  // the question we ask ourselves when clicking. As for cleaning the branches, the
  // montage SURVIVES closing for the duration of the exit animation.
  const [exportMounted, setExportMounted] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<{ id: string; name: string } | null>(null);
  const openExport = useCallback(() => {
    setExportMounted(true);
    setExportOpen(true);
  }, []);

  const isRoutines = pathname.startsWith("/routines");
  const { counts: triageCounts } = useTriageCountsQuery();

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge). Since MIN-91 the palette lists every project's tickets from the
  // search index — this cache is what makes the CURRENT project's rows exact
  // (realtime-fresh) rather than as-of-the-snapshot.
  const { data: projectIssues } = useQuery({
    queryKey: issuesKey(currentProjectId ?? ""),
    queryFn: issuesQueryFn(currentProjectId as string),
    enabled: !!currentProjectId && paletteOpen,
  });

  // Objectives feed the palette list. useObjectivesQuery shares the
  // ["objectives", projectId] cache, kept fresh by realtime — the lines of
  // current project are therefore accurate, where the search index is a
  // instant.
  const objectiveBoardId = objectiveIdFromBoardLocation(
    pathname,
    expandParam(searchParams.get("objective")),
  );
  const objectivesProjectId =
    currentProjectId && (paletteOpen || !!objectiveBoardId)
      ? currentProjectId
      : null;
  const { objectives: projectObjectives, loading: objectivesLoading } =
    useObjectivesQuery(objectivesProjectId);
  // The current project wiki pages, for ⌘K (MIN-270). Same cache as
  // the tree of the Pages tab: opening the tab does not ask for anything, and a page
  // fame there changes name in the palette without going back and forth.
  const { pages: wikiPages } =
    usePagesQuery(paletteOpen ? currentProjectId : null);

  /**
   * “New page” from ⌘K: the page is created then OPENED, as does
   * the “+” of the secondary bar (components/pages/pages-shell.tsx).
   *
   * No dialogue along the way, unlike a ticket or an objective: a
   * page does not have to provide anything before existing — its title is typed in the
   * document. The gesture expected from the palette is therefore “I am in the
   * new page”, not “I am filling out a form”.
   *
   * `markDraftPage`, like everywhere else: a created page is not a page
   * saved, and leaving without writing a letter in it makes it disappear.
   */
  const createPageFromPalette = useCreateProjectPage(navigateToWikiPage);
  // The same creation from the new-tab palette (⌘T): the page opens in a tab.
  const openWikiPageInNewTab = useCallback(
    (projectId: string, pageId: string) => { void appTabSession?.create(pageHref(projectId, pageId)); },
    [appTabSession],
  );
  const createPageInNewTab = useCreateProjectPage(openWikiPageInNewTab);
  const projectContext = useProjectContextActions({ createProjectPage: createPageFromPalette });

  // Cross-project search (MIN-91): every ticket and objective of every project,
  // so ⌘K finds them from any page. Loaded once per tab on browser idle (or on
  // the first palette open), then merged with the current project's fresher
  // caches below.
  const {
    index: searchIndex,
    armNow: armSearchIndex,
    refreshIfStale: refreshSearchIndex,
  } = useSearchIndex();

  const paletteIssues = useMemo<SearchIndexIssue[]>(
    () =>
      mergeByProject(searchIndex?.issues ?? [], currentProjectId, projectIssues),
    [searchIndex, currentProjectId, projectIssues]
  );
  // Wiki pages, ALL PROJECTS (MIN-276). Same merger as tickets: the
  // current project comes from its live cache (rename a page in the tree
  // renames in ⌘K without round trip), the others of the snapshot.
  const palettePages = useMemo<SearchIndexPage[]>(
    () =>
      mergeByProject(
        searchIndex?.pages ?? [],
        currentProjectId,
        wikiPages.length > 0
          ? wikiPages.map((p) => ({
              id: p.id,
              project_id: p.project_id,
              title: p.title,
              icon: p.icon,
              updated_at: p.updated_at,
            }))
          : null
      ),
    [searchIndex, currentProjectId, wikiPages]
  );

  const paletteObjectives = useMemo<SearchIndexObjective[]>(
    () =>
      mergeByProject(
        searchIndex?.objectives ?? [],
        currentProjectId,
        // An empty array means "this project has none" — but it also means "not
        // loaded yet", and replacing the index's rows with that would blink the
        // current project's objectives out of the list. Keep the index until the
        // real answer lands. A disabled query has no answer either: its empty
        // list is new on every render and would rebuild the closed model.
        objectivesLoading || !objectivesProjectId ? null : projectObjectives
      ),
    [searchIndex, currentProjectId, projectObjectives, objectivesLoading, objectivesProjectId]
  );

  const navLocation = useMemo<ProjectNavLocation>(
    () => ({ pathname, currentProjectId, objectiveBoardId }),
    [pathname, currentProjectId, objectiveBoardId],
  );

  // Pull Requests (MIN-66): counter of open PRs. The list is global
  // (the tab points to /pull-requests), so we derive the account from the same
  // query as the page, in its default state — the server already only returns
  // the open ones (open + draft).
  //
  // Since MIN-143 it counts ALL open PRs in the repository, not just
  // those of Numo. This is intentional: the sticker announces what the tab contains,
  // and restricting it to PRs attached to a ticket would exactly reopen the
  // problem that MIN-143 closes — a screen that shows half of the repository.
  const openPrCount = useOpenPullRequestCountQuery();

  // Smart Assign active but without rules on one of my projects (MIN-31): the
  // sidebar bears the mark, and it is the welcome which explains it — the entrance
  // “Home” therefore carries it, in both modes of the sidebar.
  // A project I hid (MIN-692) does not raise this mark either (MIN-751).
  const { warnings: allSmartAssignWarnings } = useSmartAssignWarningsQuery();
  const smartAssignWarnings = useMemo(
    () => allSmartAssignWarnings.filter((w) => !hiddenProjectIds.has(w.projectId)),
    [allSmartAssignWarnings, hiddenProjectIds]
  );
  // Badges are memoized elements: a fresh element each render would recompute
  // every navigation section and re-render the whole sidebar (MIN-875).
  const smartAssignWarned = smartAssignWarnings.length > 0;
  const smartAssignBadge = useMemo(() =>
    smartAssignWarned ? (
      <HugeiconsIcon icon={Alert01Icon} className="size-3.5 text-amber-500" aria-label={t("smartAssignIncomplete")} />
    ) : undefined, [smartAssignWarned, t]);

  // What's waiting to be sorted in each of my projects — tickets in triage +
  // open returns, the “To be sorted” queue at reception viewed by project.
  // Each home project row carries its project's total; the controls that go
  // back to Home carry the sum of those rows (MIN-695), so the number read on
  // "Home" is exactly what Home shows, current project included. Projects I
  // hid leave Home, so they leave its total too.
  const toSortEverywhere = useMemo(
    () => triageCountTotalAcross(listedProjects, triageCounts),
    [listedProjects, triageCounts]
  );
  // The “Home” entry therefore combines two marks. The triangle passes in
  // front, because an incomplete setting does not clear itself the way a
  // queue ends up emptying.
  const homeBadgeLabel = [
    smartAssignBadge ? t("smartAssignIncomplete") : null,
    toSortEverywhere > 0
      ? t("toSortEverywhereBadge", { count: toSortEverywhere })
      : null,
  ].filter(Boolean).join(" · ");
  const homeBadge = useMemo(() =>
    smartAssignBadge || toSortEverywhere > 0 ? (
      <span className="flex items-center gap-1.5">
        {smartAssignBadge}
        {toSortEverywhere > 0
          ? countBadge(
              toSortEverywhere,
              t("toSortEverywhereBadge", { count: toSortEverywhere })
            )
          : null}
      </span>
    ) : undefined, [smartAssignBadge, toSortEverywhere, t]);
  // The back rows wear the same numbers on their chevron: Home's aggregate
  // (amber while Smart Assign is incomplete), or a project's own total.
  const smartAssignAlert = smartAssignWarnings.length > 0;
  const homeBackBadge = useMemo<SidebarBackBadge | undefined>(
    () => toSortEverywhere > 0 || smartAssignAlert
      ? { count: toSortEverywhere, label: homeBadgeLabel, alert: smartAssignAlert }
      : undefined,
    [toSortEverywhere, homeBadgeLabel, smartAssignAlert]
  );
  const projectBackBadge = useCallback(
    (projectId: string): SidebarBackBadge | undefined => {
      const total = triageCountTotal(triageCounts[projectId]);
      return total > 0 ? { count: total, label: t("triageBadge", { count: total }) } : undefined;
    },
    [triageCounts, t]
  );
  const backBadgeFor = useCallback(
    (href: string) => {
      if (href === "/home") return homeBackBadge;
      const project = /^\/projects\/([^/]+)$/.exec(href);
      return project ? projectBackBadge(project[1]) : undefined;
    },
    [homeBackBadge, projectBackBadge]
  );

  const shellCommandGroups = useShellCommandGroups({
    currentProject,
    switcherProjects,
    projectById,
    createPageFromPalette,
    createPageInNewTab,
    openExport,
  });

  // One wiki row, shared by the index model below and by the palette for pages
  // that only the content search found.
  const buildPageItem = useCallback(
    (page: SearchIndexPage): PaletteItem | null => {
      const project = paletteProjectById.get(page.project_id);
      if (!project) return null;
      return {
        key: `wiki-${page.id}`,
        label: page.title || tPages("untitled"),
        icon: page.icon ? emojiIcon(page.icon) : File02Icon,
        keywords: [project.name, project.key],
        meta: projectChip(project),
        metaText: project.name,
        entityType: "page",
        contextId: page.project_id,
        data: page,
        href: pagePath(page.project_id, page.id),
        onSelect: () => navigateToWikiPage(page.project_id, page.id),
      };
    },
    [paletteProjectById, navigateToWikiPage, tPages]
  );

  // ── Data groups: tickets + objectives, all projects combined (MIN-91) ────
  // Separated from the command groups above because they are the only ones
  // weigh: a few thousand lines, each with its React elements
  // (ID badge, project chip). We therefore manufacture them on demand,
  // with two budgets — complete list for the desktop palette (virtualized,
  // and which does not return anything as long as it is closed), capped list for nav
  // mobile (which mounts everything it receives).
  const buildDataGroups = useCallback(
    (
      issues: SearchIndexIssue[],
      objectives: SearchIndexObjective[],
      pages: SearchIndexPage[]
    ): PaletteGroup[] => {
      const groups: PaletteGroup[] = [];

      // The identifier carries the project key (MIN-42 vs AKP-7), therefore one line
      // says where it comes from; `contextId` brings up the current project.
      if (issues.length > 0) {
        groups.push({
          key: "issues",
          heading: ti("entityPlural"),
          items: issues.flatMap((i) => {
            const project = paletteProjectById.get(i.project_id);
            // Unknown project (deleted, or left) → nothing to label or
            // route the ticket: we discard it rather than displaying “-12”.
            if (!project) return [];
            const id = issueIdentifier(project.key, i.number);
            return [
              {
                key: `issue-${i.id}`,
                label: i.title,
                keywords: [id, String(i.number), project.name, project.key],
                meta: identifierBadge(id),
                metaText: id,
                entityType: "issue",
                contextId: i.project_id,
                data: i,
                href: issueHref(i.project_id, i),
                onSelect: () => openIssuePanel(i.project_id, i.id),
              },
            ];
          }),
        });
      }

      // An objective opens on ITS page (MIN-226): it is an object that we come
      // see, plus a panel that was placed over the current page. Even
      // link as notifications, regardless of the project.
      if (objectives.length > 0) {
        groups.push({
          key: "objectives",
          heading: t("objectives"),
          items: objectives.flatMap((o) => {
            const project = paletteProjectById.get(o.project_id);
            if (!project) return [];
            return [
              {
                key: `objective-${o.id}`,
                label: o.name,
                // The palette shows its status and colors its name (MIN-785).
                keywords: [project.name, project.key],
                meta: projectChip(project),
                metaText: project.name,
                entityType: "objective",
                contextId: o.project_id,
                data: o,
                href: objectiveHref(o.project_id, o.id),
                onSelect: () =>
                  router.push(objectiveHref(o.project_id, o.id)),
              },
            ];
          }),
        });
      }

      // ── The wiki, ALL PROJECTS (MIN-270, cross-project since MIN-276) ───
      //
      // The TITLES come from the index (filtered as you type, serverless). The
      // CONTENT hits are applied inside the palette (withPageContentHits), so
      // a search result never rebuilds this model. The group is always present
      // so a page found only by its content keeps the Pages category.
      groups.push({
        key: "wiki-pages",
        heading: t("pages"),
        items: pages.flatMap((page) => {
          const row = buildPageItem(page);
          return row ? [row] : [];
        }),
      });

      return groups;
    },
    [paletteProjectById, buildPageItem, openIssuePanel, t, ti]
  );

  // Prepare the full model during the palette's idle warmup and retain it
  // between openings. Narrow windows also need the full model when a keyboard
  // shortcut opens the palette.
  const desktopDataGroups = usePaletteDataGroups(
    { mounted: paletteMounted, mobileLayout, open: paletteOpen },
    buildDataGroups,
    paletteIssues,
    paletteObjectives,
    palettePages,
  );

  // ── Workspace groups: routines, pull requests, views, inbox (MIN-846) ──
  // Each reads the cache of its own screen, and only while the palette is
  // open: these lists are not in the search index, and keeping them warm
  // on every page would poll for a search nobody started. Routines and pull
  // requests follow the plan gate of their navigation entries.
  const workspaceReads = paletteOpen;
  const { routines: paletteRoutines } = useRoutinesQuery({
    enabled: workspaceReads && agentsAllowed,
  });
  const { data: palettePullRequests } = useQuery({
    ...allPullRequestsQueryOptions("all"),
    enabled: workspaceReads && agentsAllowed,
  });
  // The views of the global board and of the project at hand, under the
  // keys the boards use. Every project's views would cost one request per
  // project, each seeding that project's baseline views.
  const { data: globalViews } = useQuery({
    queryKey: GLOBAL_VIEWS_KEY,
    queryFn: ({ signal }) => fetchViewsApi({ kind: "global" }, signal),
    enabled: workspaceReads,
  });
  const { data: projectViews } = useQuery({
    queryKey: viewsKey(currentProjectId ?? ""),
    queryFn: ({ signal }) =>
      fetchViewsApi({ kind: "project", projectId: currentProjectId as string }, signal),
    enabled: workspaceReads && !!currentProjectId,
  });
  const workspaceGroups = useMemo<PaletteGroup[]>(() => {
    if (!paletteMounted) return [];
    return buildWorkspaceGroups({
      routines: agentsAllowed ? paletteRoutines : [],
      pullRequests: agentsAllowed ? (palettePullRequests?.pullRequests ?? []) : [],
      views: [...(globalViews ?? []), ...(currentProjectId ? (projectViews ?? []) : [])],
      notifications,
      projectById: paletteProjectById,
      labels: {
        routines: t("routines"),
        pullRequests: t("pullRequests"),
        views: t("boardViews"),
        notifications: t("inbox"),
        globalBoard: t("allIssues"),
        notificationTitle: (notification) => notificationPlainText(notification).title,
        notificationLine: (notification) => {
          const text = notificationPlainText(notification);
          return text.context ? `${text.actor} · ${text.context}` : text.actor;
        },
      },
      navigate: (href) => router.push(href),
      openNotification: openInboxAtNotification,
    });
  }, [paletteMounted, agentsAllowed, paletteRoutines, palettePullRequests, globalViews, projectViews, currentProjectId, notifications, paletteProjectById, router, t, notificationPlainText]);

  const inboxItem = useMemo<AppNavItem>(() => ({
    key: "inbox",
    label: t("inbox"),
    icon: InboxIcon,
    onClick: openInbox,
    shortcut: "I",
    // The one counter that asks for attention (MIN-727): a filled pill.
    badge: inboxCount > 0
      ? <NotificationBadge count={inboxCount} label={t("inboxBadge", { count: inboxCount })} />
      : undefined,
  }), [inboxCount, t]);

  // The installed PWA's icon carries the same count (Badging API). The desktop
  // shell sets its own dock badge (lib/use-desktop-notifications.ts).
  useEffect(() => {
    if (getDesktopBridge() || typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const badge = inboxCount > 0 ? navigator.setAppBadge(inboxCount) : navigator.clearAppBadge();
    void badge.catch(() => {});
  }, [inboxCount]);

  // Verrous de plan (MIN-72) : Agents & Pull Requests restent visibles mais
  // grayed out when the plan does not include them; “New project” turns gray
  // ceiling. Shared by the two sidebar modes (project/home).
  const pullRequestsItem: AppNavItem = {
    key: "pull-requests",
    label: t("pullRequests"),
    icon: GitPullRequestIcon,
    href: "/pull-requests",
    active: pathname.startsWith("/pull-requests"),
    shortcut: "R",
    descends: true,
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    ...countBadges(
      agentsAllowed ? openPrCount : 0,
      t("pullRequestsBadge", { count: openPrCount })
    ),
  };
  // Numo has no sidebar item any more: the conversation is only reachable from
  // the FAB, whose animated border carries the “working” signal. The finished /
  // awaiting / unread dots of the former item live in the inbox rows and in the
  // conversation history of the panel. The palette entry and G J open it.
  const routinesItem: AppNavItem = {
    key: "routines",
    label: t("routines"),
    icon: ROUTINE_ICON,
    href: "/routines",
    active: isRoutines,
    shortcut: "U",
    descends: true,
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    // Only an owner can schedule a routine; the page checks the scheduler.
    contextActions: agentsAllowed && projects.some((p) => p.owner_id === user?.id) ? [{
      id: "routines-new",
      label: tRoutines("newRoutine"),
      icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />,
      transfersFocus: true,
      onSelect: () => router.push("/routines?new=1"),
    }] : undefined,
  };

  /**
   * The HOME panel — the sidebar's top level. It is shown as-is when no
   * project is open, and it is also what the back rows lift to FROM a
   * project (the browse keeps the page while the panel goes up): one variant
   * for both, since none of its rows depend on the page underneath.
   */
  const homeSections = useMemo<AppNavSection[]>(
    () => [
      {
        items: [
          inboxItem,
          pullRequestsItem,
          routinesItem,
          {
            key: "all-global",
            label: t("allIssues"),
            icon: BOARD_ICON,
            href: "/all",
            active: pathname === "/all",
            shortcut: "B",
            contextActions: projects.length > 0 ? [{
              id: "all-new-issue",
              label: t("newIssue"),
              icon: <HugeiconsIcon icon={BOARD_ICON} className="size-4" />,
              transfersFocus: true,
              onSelect: () => openCreateIssue(),
            }] : undefined,
          },
          {
            key: "home",
            label: t("home"),
            icon: Home01Icon,
            href: "/home",
            active: pathname.startsWith("/home"),
            shortcut: "H",
            badge: smartAssignBadge,
          },
        ],
      },
      {
        reorder: projectReorder,
        items: [
          ...listedProjects.map((p) => {
            // A single number for both halves of the line: enter the
            // project breaks it down into its Triage and Feedback tabs, and the
            // total must land there exactly.
            const toTriage = triageCountTotal(triageCounts[p.id]);
            return {
              key: projectNavKey(p.id),
              label: p.name,
              icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
              href: projectPath(p.id),
              // Entering a project swaps the whole sidebar the same way a
              // level-2 page does: the row says so with its chevron.
              descends: true,
              contextActions: projectContext.projectActions(p),
              ...countBadges(toTriage, t("triageBadge", { count: toTriage })),
            };
          }),
          // The drafts, following the projects and in the same list: this is
          // the same thing up to one state, and relegating them elsewhere would require
          // to go get them. The line is that of a project — orb, name —
          // except its mark, and clicking reopens the wizard where we left it.
          ...projectDrafts.map(
            (d): AppNavItem => ({
              key: `project-draft-${d.id}`,
              label: d.name,
              icon: projectOrbIcon(draftOrbSeed(d), draftIconUrl(d)),
              onClick: () => openProjectDraft(d),
              badge: draftBadge(tProjects("draftBadge")),
              tooltip: tProjects("draftResume", { name: d.name }),
              contextActions: [
                {
                  id: "delete-project-draft",
                  label: tProjects("draftDelete"),
                  icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
                  variant: "destructive",
                  onSelect: () => setDraftToDelete({ id: d.id, name: d.name }),
                },
              ],
            }),
          ),
          {
            key: "new-project",
            label: t("newProject"),
            icon: Add01Icon,
            onClick: openCreateProject,
            disabled: projectLimitReached,
          },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, inboxCount, openPrCount, projects, listedProjects, projectReorder, projectDrafts, openProjectDraft, triageCounts, openCreateProject, openCreateIssue, agentsAllowed, projectLimitReached, smartAssignBadge, projectContext.projectActions, user?.id, t, tProjects]
  );

  const sections = useMemo<AppNavSection[]>(() => {
    if (!currentProject) return homeSections;
    return [
        {
          // Project mode keeps ONLY the project context: back home, the
          // project switcher, and the project's own items (MIN-546 review).
          items: [
            {
              key: HOME_BACK_NAV_KEY,
              label: t("home"),
              icon: ArrowLeft01Icon,
              href: "/home",
              shortcut: "H",
              badge: homeBadge,
              tooltip: homeBadgeLabel || undefined,
            },
          ],
        },
        {
          items: projectNavEntries(currentProject.id, navLocation, triageCounts[currentProject.id]).map(
            (entry): AppNavItem => ({
              key: entry.key,
              label: t(entry.labelKey),
              icon: entry.icon,
              href: entry.href,
              active: entry.active,
              shortcut: entry.shortcut,
              ...(entry.descends ? { descends: true } : {}),
              ...(entry.contextTab ? { contextActions: projectContext.tabActions(currentProject, entry.contextTab) } : {}),
              badge: navEntryBadge(entry, t),
            }),
          ),
        },
      ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, homeSections, navLocation, triageCounts, homeBadge, projectContext.tabActions, t]);

  // The inbox is a compact top control on desktop and a slot of the bottom
  // bar on a phone: neither lists it among the rows.
  const desktopSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.key !== "inbox"),
      })),
    [sections],
  );
  // The home panel the back rows lift to, same desktop filter.
  const homeDesktopSections = useMemo(
    () =>
      homeSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.key !== "inbox"),
      })),
    [homeSections],
  );

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? projectNavKey(currentProject.id) : "home";
  const [sidebarLayerOpen, setSidebarLayerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  // Both sidebar layouts expose account/global options in their pinned footer;
  // the command palette keeps the same account destinations available.
  const { commandGroup: accountCommandGroup } =
    useAccountActions();

  // Both layouts share the virtualized command palette and full data index.
  // Mobile account destinations also appear in the navigation sheet.
  const paletteGroups = useMemo(
    () => [
      ...shellCommandGroups,
      ...desktopDataGroups,
      ...workspaceGroups,
      accountCommandGroup,
    ],
    [shellCommandGroups, desktopDataGroups, workspaceGroups, accountCommandGroup]
  );

  const mobileNavigation = useMemo(() => {
    const settingsPanel = (project?: Project): MobileMenuPanel => ({
      key: `settings-${project?.id ?? "account"}`,
      title: project ? t("projectSettings") : t("accountSettings"),
      sidebarRoute: project ? projectPath(project.id, "settings") : "/settings",
      render: (navigation: MobileMenuNavigation) => <MobileSettingsMenu {...navigation} projectId={project?.id} />,
      // Back from a project's settings returns to its panel, else to Home.
      backBadge: project ? projectBackBadge(project.id) : homeBackBadge,
    });
    const panels = new Map<string, MobileMenuPanel>();
    projects.forEach((project) => {
      const base = projectPath(project.id);
      const resource = (kind: "objectives" | "pages" | "triage" | "feedback"): MobileMenuPanel => ({ key: `${project.id}-${kind}`, title: t(kind), sidebarRoute: kind === "pages" && pathname.startsWith(`${base}/pages`) ? pathname : `${base}/${kind}`,
        render: (navigation: MobileMenuNavigation) => <MobileProjectMenu {...navigation} projectId={project.id} kind={kind} />,
        backBadge: projectBackBadge(project.id) });
      panels.set(project.id, { key: projectNavKey(project.id), title: project.name, project, sections: [{
        items: projectNavEntries(project.id, navLocation, triageCounts[project.id]).map((entry) => ({
          key: entry.key,
          label: t(entry.labelKey),
          icon: menuIcon(entry.icon),
          active: entry.active,
          ...(entry.contextTab ? { contextActions: projectContext.tabActions(project, entry.contextTab) } : {}),
          ...(entry.key === "tickets" ? { href: entry.href }
            : { panel: entry.key === "settings" ? settingsPanel(project) : resource(entry.key) }),
          badge: navEntryBadge(entry, t),
        })),
      }] });
    });
    // The inbox has its own slot in the bottom bar (MIN-907).
    const root = toMenuSections(homeDesktopSections).map((section) => ({ ...section,
      items: section.items.map((item) => {
        const projectId = projectIdFromNavKey(item.key);
        return { ...item,
        panel: projectId ? panels.get(projectId)
          : item.key === "routines" ? { key: "routines", title: t("routines"), sidebarRoute: "/routines", backBadge: homeBackBadge, render: (navigation: MobileMenuNavigation) => <MobileRoutinesMenu {...navigation} /> }
          : item.key === "pull-requests" ? { key: "pull-requests", title: t("pullRequests"), sidebarRoute: "/pull-requests", backBadge: homeBackBadge, render: (navigation: MobileMenuNavigation) => <MobilePullRequestsMenu {...navigation} /> }
          : undefined,
        };
      }),
    }));
    const projectPanel = currentProject ? panels.get(currentProject.id) : undefined;
    const resourcePanel = projectPanel?.sections?.flatMap((section) => section.items).find((item) => item.panel && item.active)?.panel;
    const globalPanel = root.flatMap((section) => section.items).find((item) => item.panel?.sidebarRoute === pathname)?.panel
      ?? (pathname === "/settings" ? settingsPanel() : pathname === "/trash" || pathname === "/admin" ? { key: pathname, title: t(pathname === "/trash" ? "trash" : "adminDashboard"), sidebarRoute: pathname, backBadge: homeBackBadge } : undefined);
    return { sections: root, projects: switcherProjects, homeBadge, homeBadgeLabel, inboxCount, inboxBadgeLabel: t("inboxBadge", { count: inboxCount }), initialPanels: projectPanel ? [projectPanel, ...(resourcePanel ? [resourcePanel] : [])] : globalPanel ? [globalPanel] : [] };
    // `homeBadge` is a fresh element each render; `toSortEverywhere` and the
    // Smart Assign warnings it is built from are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, switcherProjects, homeDesktopSections, inboxCount, currentProject, pathname, navLocation, triageCounts, projectContext.tabActions, t, projectBackBadge, homeBackBadge, homeBadgeLabel, toSortEverywhere, smartAssignWarnings.length]);

  // Opening the palette arms the cross-project index if idle hasn't yet, and
  // revalidates it when the snapshot has aged (no-op while fresh).
  const handlePaletteOpenChange = useCallback(
    (next: boolean) => {
      // The palette is keyed by its mode: the mode changes only on opening,
      // so a closing palette keeps its instance and plays its exit animation.
      if (next) {
        warmPalette();
        setPaletteMode("default");
      }
      setPaletteOpen(next);
      if (!next) return;
      armSearchIndex();
      refreshSearchIndex();
    },
    [armSearchIndex, refreshSearchIndex, warmPalette]
  );
  const openPalette = useCallback(() => handlePaletteOpenChange(true), [handlePaletteOpenChange]);
  // The search tap raises the keyboard the palette's field then takes over.
  const openMobilePalette = useCallback(() => {
    primeMobileKeyboard();
    openPalette();
  }, [openPalette]);
  const openDestinationPalette = useCallback(() => {
    warmPalette();
    setPaletteMode("destination");
    setPaletteOpen(true);
    armSearchIndex();
    refreshSearchIndex();
  }, [armSearchIndex, refreshSearchIndex, warmPalette]);
  useCommandPaletteLauncher({
    open: paletteOpen,
    onOpenChange: handlePaletteOpenChange,
    onNewTab: openDestinationPalette,
  });
  // A palette entry that navigates closes the palette first; the route
  // change that follows then focuses the content (WCAG 2.4.3).
  const handlePaletteContentOpenChange = useCallback((next: boolean) => {
    if (!next) requestMainFocusOnNavigation();
    setPaletteOpen(next);
  }, []);
  const handleDestinationSelect = useCallback((href: string) => {
    requestMainFocusOnNavigation();
    setPaletteOpen(false);
    void appTabSession?.create(href);
  }, [appTabSession]);
  // Hovering a destination row is the intent to open it: the same prefetch
  // an existing tab label already gets (fourth pass MIN-540).
  const handleDestinationPrefetch = useCallback((href: string) => {
    appTabSession?.prefetch(href);
  }, [appTabSession]);

  return (
    <ProjectContextActionsProvider value={projectContext.projectActions}>
    <div className="app-workspace relative flex h-dvh w-full min-w-0 flex-col overflow-hidden">
      {/* First in the document, before the top bar and its tabs. */}
      <SkipToContentLink />
      <AppTopBar
        ready={Boolean(appTabSession)}
        hidden={sidebarHidden}
        inbox={inboxItem}
        onSearch={openPalette}
        onSearchWarm={warmPalette}
        onNewTab={openDestinationPalette}
      />
    <AppShell
      // `app-shell` targets the shell's <main>; its bottom reserve follows the
      // real mobile-nav height through --mobile-nav-clearance.
      className="app-shell"
      // The navigation block is the modular primary sidebar (MIN-546): one
      // fixed-width column that hosts every navigation level, including the
      // pages' secondary bars — teleported in by SecondarySidebar.
      //
      // Hidden sidebars remain available from the left-edge overlay without
      // reserving space. Page content and Numo keep their normal behavior.
      sidebar={
        <SidebarNavOverlay
          hidden={sidebarHidden}
          width={EXPANDED_WIDTH}
          dockedWidth={EXPANDED_WIDTH}
          pinned={sidebarLayerOpen}
        >
          <AppSidebar
            sections={desktopSections}
            homeSections={homeDesktopSections}
            modeKey={modeKey}
            currentProject={currentProject}
            projects={switcherProjects}
            backBadgeFor={backBadgeFor}
            onLayerOpenChange={setSidebarLayerOpen}
          />
        </SidebarNavOverlay>
      }
      // Narrow macOS windows use the mobile shell, so the primary sidebar is
      // absent. This native-control clearance is not an application header and
      // stays display:none everywhere else.
      header={
        <div className="compact-window-controls-clearance h-11 shrink-0 items-center border-b border-border px-4">
          <HeaderWindowButtonsSlot />
        </div>
      }
      mobileNav={
        <MobileNavigation
          {...mobileNavigation}
          onSearch={openMobilePalette}
        />
      }
    >
      <AppTabChangeEffect onChange={closeTransientPanels} />
      <AppTabPanel>{children}</AppTabPanel>
      <ContentToaster />
      {/* Command palette (⌘K / ⌘P, sidebar search) — same groups as
 mobile nav search, tickets enriched with actions (⌘;). The cross-project
 index also serves these actions: members and categories of the project
 OF THE TICKET, which is not necessarily that of the page (MIN-91). */}
      {paletteMounted ? (
        <CommandPalette
          key={paletteMode}
          groups={paletteGroups}
          open={paletteOpen}
          onOpenChange={handlePaletteContentOpenChange}
          searchIndex={searchIndex}
          destinationOnly={paletteMode === "destination"}
          onDestinationSelect={handleDestinationSelect}
          onPrefetchDestination={handleDestinationPrefetch}
          pageItem={buildPageItem}
        />
      ) : null}
      <InboxPopover open={inboxOpen} onOpenChange={setInboxOpen} />
      <MobileOpenPathListener />
      <UnreadCountAnnouncer count={inboxCount} label={t("inboxBadge", { count: inboxCount })} />
      <GlobalIssuePanelHost />
      <GlobalPagePanelHost />
      {/* CSV export opened from the palette — mounted here for the same reason:
 it starts from any page, and takes the tickets from any
 any of my projects. The draft page is just a blemish. */}
      {exportMounted && (
        <ExportIssuesDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          defaultProjectId={currentProjectId}
        />
      )}
      {projectContext.dialog}
      <ConfirmDeleteDialog
        open={draftToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setDraftToDelete(null);
        }}
        title={tProjects("draftDeleteTitle", { name: draftToDelete?.name ?? "" })}
        description={tProjects("draftDeleteDescription")}
        confirmLabel={tProjects("draftDelete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          if (!draftToDelete) return;
          await deleteProjectDraft(draftToDelete.id).catch((err: Error) =>
            toast.error(err.message),
          );
        }}
      />
    </AppShell>
    </div>
    </ProjectContextActionsProvider>
  );
}
