"use client";

import { pageHref } from "@/lib/pages-navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { ContentToaster } from "@/components/content-toaster";
import { Add01Icon, AiAutoRotateIcon as CycleIcon, Alert01Icon, ArrowLeft01Icon, CircleDotDashedIcon, Clock01Icon as FileClock, Delete02Icon, Download01Icon, File02Icon, GitPullRequestIcon, Home01Icon, InboxIcon, KeyboardIcon, MessageMultiple01Icon, Settings01Icon, StickyNote02Icon, Target01Icon, TaskEdit01Icon } from "@hugeicons/core-free-icons";
import {
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
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { AppShell } from "@/components/app-shell";
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
import { openInbox } from "@/lib/inbox-launcher";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useHiddenProjects, visibleNavigationProjects } from "@/lib/use-hidden-projects";
import { useCreate } from "@/lib/create-context";
import { useAllDrafts } from "@/lib/use-all-drafts";
import { useScratchpad } from "@/lib/scratchpad-context";
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
import { MobileProjectMenu, MobileRoutinesMenu, MobilePullRequestsMenu, MobileSettingsMenu } from "@/components/mobile-project-menu";
import { MobileNavigation, type MobileMenuSection, type MobileMenuPanel, type MobileMenuNavigation } from "@/components/mobile-navigation";
import { useAccountActions } from "@/components/mobile-account";
import { AppTopBar } from "@/components/app-top-bar";
import { AppTabPanel } from "@/components/app-tab-view-host";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { useAppTabChange } from "@/lib/use-app-tab-change";
import { HeaderWindowButtonsSlot } from "@/components/desktop-window-buttons";
import { ProjectOrb, projectOrbIcon } from "@/components/project-orb";
import { ProjectContextActionsProvider, useCreateProjectPage, useProjectContextActions } from "@/components/project-context-actions";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { NumoIcon } from "@/components/numo-icon";
import {
  AppSidebar,
  EXPANDED_WIDTH,
  type AppNavItem,
  type AppNavSection,
  type SidebarBackBadge,
} from "@/components/app-sidebar";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";
import { BOARD_ICON, ROUTINE_ICON } from "@/components/feature-icons";
import {
  settingsSectionHref,
  useSettingsSections,
  type SettingsSection,
} from "@/lib/settings-sections";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
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
function GlobalIssuePanelHost() {
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
}

/** The page panel (MIN-777), mounted after the issue panel so a page opened
 * from an issue lies above it. */
function GlobalPagePanelHost() {
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
}

/** Right-aligned project tag shown on palette rows (orb + name), AutoKap-style. */
function projectChip(project: Project) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-3.5" />
      <span className="max-w-[9rem] truncate">{project.name}</span>
    </span>
  );
}

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

/** Numo's face in static nav/palette icon (no perpetual blinking,
 like list icons). Slotted where the lucid tabs pass a `className`. */
const NumoNavIcon = ({ className }: { className?: string }) => (
  <NumoIcon animated={false} className={className} />
);
NumoNavIcon.displayName = "NumoNavIcon";

const TriageNavIcon = ({ className }: { className?: string }) => (
  <AppIcon icon={CircleDotDashedIcon} className={className} strokeWidth={2.25} />
);
TriageNavIcon.displayName = "TriageNavIcon";

import { countBadge, countBadges } from "@/components/nav-badge";
import { NotificationBadge } from "@/components/notification-badge";
import { getDesktopBridge } from "@/lib/desktop/bridge";

/**
 * The mark of a draft project, in the exact place of the “to sort” counter
 * of a created project: this is the only point where the line differs, and the void there
 * would suggest a project without anything to sort.
 */
function draftBadge(label: string) {
  return <AppIcon icon={FileClock} className="size-3.5 text-muted-foreground" aria-label={label} />;
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
  useMobileViewport();
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
  const locale = useLocale();
  const openAssistant = useAssistantPanelActions().open;
  const ti = useTranslations("Issue");
  const tk = useTranslations("Keyboard");
  const tScratch = useTranslations("Scratchpad");
  const tDrafts = useTranslations("Drafts");
  const tRoutines = useTranslations("Routines");
  const tSettings = useTranslations("Settings");
  const tExport = useTranslations("Export");
  const tBilling = useTranslations("Billing");
  const tProjects = useTranslations("Projects");
  const tPages = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const { agentsAllowed, projectLimitReached } = usePlanGates();
  const pathname = usePathname();
  // The stable session: activation re-renders only the tab panel below.
  const appTabSession = useOptionalAppTabSession();
  const searchParams = useSearchParams();
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
  const { openCreateIssue, openCreateObjective } = useCreate();
  const { drafts: creationDrafts } = useAllDrafts();
  const { open: openScratchpad } = useScratchpad();
  const { unreadCount } = useNotifications();
  const {
    openIssue: openIssuePanel,
    closeIssue: closeIssuePanel,
  } = useIssuePanelActions();
  const { closePage: closePagePanel } = usePagePanelActions();
  const closeTransientPanels = useCallback(() => {
    closeIssuePanel();
    closePagePanel();
  }, [closeIssuePanel, closePagePanel]);
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
  const { setOpen: setCheatsheetOpen } = useCheatsheet();
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
  useEffect(() => {
    const run = () => warmPalette();
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 3_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(run, 1_500);
    return () => window.clearTimeout(handle);
  }, [warmPalette]);

  // These surfaces are less frequent, so preload their code after the palette.
  // Pointer intent below still starts the scratchpad immediately when needed.
  useEffect(() => {
    const run = () => {
      preloadSurface(loadGlobalIssuePanel);
      preloadSurface(loadIssueSidePanel);
      preloadSurface(loadScratchpadModal);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 5_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(run, 2_500);
    return () => window.clearTimeout(handle);
  }, []);

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
  const listedProjects = useMemo(
    () => visibleNavigationProjects(projects, hiddenProjectIds),
    [projects, hiddenProjectIds]
  );
  const switcherProjects = useMemo(
    () => visibleNavigationProjects(projects, hiddenProjectIds, currentProjectId),
    [projects, hiddenProjectIds, currentProjectId]
  );
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
    queryKey: ["issues", currentProjectId ?? ""],
    queryFn: issuesQueryFn(currentProjectId as string),
    enabled: !!currentProjectId && paletteOpen,
  });

  // Objectives feed the palette list. useObjectivesQuery shares the
  // ["objectives", projectId] cache, kept fresh by realtime — the lines of
  // current project are therefore accurate, where the search index is a
  // instant.
  const objectiveBoardId = objectiveIdFromBoardLocation(
    pathname,
    searchParams.get("objective"),
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

  // Triage is a hidden issue status — the sidebar counter derives from the
  // same issues cache the board and search already keep fresh.
  const triageCount = currentProjectId
    ? (triageCounts[currentProjectId]?.triage ?? 0)
    : 0;

  // Feedback (MIN-37): counter of open/planned feedback, via an endpoint
  // lightweight (badge does not need the full list).
  const { data: feedbackCountData } = useQuery({
    queryKey: ["feedback-count", currentProjectId ?? ""],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${currentProjectId}/feedback/counts`);
      if (!r.ok) return { count: 0 };
      return (await r.json()) as { count: number };
    },
    enabled: !!currentProjectId,
    staleTime: 60_000,
  });
  const feedbackCount = feedbackCountData?.count ?? 0;

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
  const smartAssignBadge =
    smartAssignWarnings.length > 0 ? (
      <HugeiconsIcon icon={Alert01Icon} className="size-3.5 text-amber-500" aria-label={t("smartAssignIncomplete")} />
    ) : undefined;

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
  const homeBadge =
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
    ) : undefined;
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

  const commandGroups = useMemo<PaletteGroup[]>(() => {
    const groups: PaletteGroup[] = [];
    const createKw = ["create", "créer", "new", "nouveau"];

    // ── Create (issue-first) ──────────────────────────────────────────
    // New issue is always the leading option. Inside a project it targets that
    // project; from anywhere else you pick which project to create it in.
    const createItems: PaletteItem[] = [];
    if (currentProject) {
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: TaskEdit01Icon,
        keywords: [...createKw, ti("entity"), currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        // The global single-key shortcut (lib/create-context) targets the
        // current project's dialog when one is open
        keys: ["C"],
        onSelect: () => openCreateIssue({ projectId: currentProject.id }),
      });
      createItems.push({
        key: "create-objective",
        label: t("newObjective"),
        icon: Target01Icon,
        keywords: [...createKw, currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        keys: ["O"],
        onSelect: () => openCreateObjective({ projectId: currentProject.id }),
      });
      // The page only follows the open project IN a project, unlike the
      // ticket: outside the project, the palette would not know in which wiki to write,
      // and the page cache is only loaded for the current project.
      createItems.push({
        key: "create-page",
        label: tPages("newPage"),
        icon: File02Icon,
        keywords: [
          ...createKw,
          "page",
          "wiki",
          "document",
          "doc",
          "note",
          currentProject.name,
          currentProject.key,
        ],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        contextId: currentProject.id,
        onSelect: () => createPageFromPalette(currentProject.id),
        onSelectInNewTab: () => createPageInNewTab(currentProject.id),
      });
    } else {
      // Outside a project, creation is GENERIC: one "New issue" line and one
      // "New objective", not a line per project — the dialogs pick the
      // project themselves. The global single-key shortcuts always apply.
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: TaskEdit01Icon,
        keywords: [...createKw, ti("entity")],
        keys: ["C"],
        onSelect: () => openCreateIssue(),
      });
      // Objective creation from anywhere (MIN-33): one entry — the dialog's split
      // button picks the target project.
      if (projects.length > 0) {
        createItems.push({
          key: "create-objective",
          label: t("newObjective"),
          icon: Target01Icon,
          keywords: createKw,
          keys: ["O"],
          onSelect: () => openCreateObjective(),
        });
      }
    }
    if (!projectLimitReached) {
      createItems.push({
        key: "create-project",
        label: t("newProject"),
        icon: Add01Icon,
        keywords: createKw,
        onSelect: openCreateProject,
      });
    }
    // Drafts live IN the “Create” group, under “New Project”:
    // a draft is a creation in progress, and both lines lead to the same
    // place — the wizard, new or reused. Putting them in “Go to” would have
    // ranked a modal among destinations.
    //
    // No plan lock here, unlike “New project”: resume
    // a draft is not created, and the ceiling is said to be created.
    for (const d of projectDrafts) {
      createItems.push({
        key: `resume-project-draft-${d.id}`,
        label: tProjects("draftResume", { name: d.name }),
        icon: FileClock,
        keywords: [...createKw, d.name, "brouillon", "draft", "reprendre", "resume"],
        onSelect: () => openProjectDraft(d),
      });
    }
    // Issue and objective drafts too (MIN-753): the bottom bar's drafts tray
    // is hidden on a phone, where the palette is their only way back.
    for (const d of creationDrafts) {
      const draftProject = projectById.get(d.projectId);
      const name = d.title.trim() || tDrafts("untitled");
      createItems.push({
        key: `resume-${d.kind}-draft-${d.id}`,
        label: d.kind === "issue" ? tDrafts("resumeIssue", { name }) : tDrafts("resumeObjective", { name }),
        icon: d.kind === "issue" ? TaskEdit01Icon : Target01Icon,
        keywords: [...createKw, name, "brouillon", "draft", "reprendre", "resume"],
        ...(draftProject ? { meta: projectChip(draftProject), metaText: draftProject.name, contextId: draftProject.id } : {}),
        onSelect: () => d.kind === "issue"
          ? openCreateIssue({ projectId: d.projectId, draftId: d.id })
          : openCreateObjective({ projectId: d.projectId, draftId: d.id }),
      });
    }
    groups.push({ key: "create", heading: t("create"), items: createItems });

    // ── Go to (global) ────────────────────────────────────────────────
    // Every shortcut below mirrors keyboard-context's runChord (G then key);
    // when a chord changes there, it changes here too.
    groups.push({
      key: "goto",
      heading: t("goTo"),
      items: [
        { key: "go-documentation", label: t("documentation"), icon: File02Icon,
          keywords: ["documentation", "docs", "help"],
          onSelect: () => window.open(documentationPath(null, locale), "_blank", "noopener,noreferrer") },
        { key: "go-home", label: t("home"), icon: Home01Icon, href: "/home", keys: ["G", "H"], entityType: "navigation", onSelect: () => router.push("/home") },
        { key: "go-inbox", label: t("inbox"), icon: InboxIcon, keys: ["G", "I"], onSelect: openInbox },
        {
          key: "open-notes",
          label: tScratch("open"),
          icon: StickyNote02Icon,
          keys: ["mod", "⇧", "K"],
          keywords: ["notes", "scratchpad", "todo", "tâches", "problems"],
          onSelect: () => openScratchpad("palette"),
        },
        ...(agentsAllowed
          ? [
              {
                key: "go-pull-requests",
                label: t("pullRequests"),
                icon: GitPullRequestIcon,
                href: "/pull-requests",
                keys: ["G", "R"],
                entityType: "navigation",
                onSelect: () => router.push("/pull-requests"),
              },
              {
                // Numo has no page of its own any more (the FAB hosts the whole
                // conversation): the entry, like its chord, OPENS the panel.
                key: "go-agents",
                label: t("agents"),
                icon: NumoNavIcon,
                keys: ["G", "J"],
                keywords: ["numo", "chat", "assistant", "conversation"],
                onSelect: () => openAssistant(),
              },
              {
                // ROUTINES (MIN-185) have their own page and their own
                // entry into primary navigation.
                key: "go-routines",
                label: tRoutines("title"),
                icon: ROUTINE_ICON,
                href: "/routines",
                keys: ["G", "U"],
                entityType: "navigation",
                keywords: [
                  "routine",
                  "routines",
                  "schedule",
                  "scheduled",
                  "cron",
                  "récurrent",
                  "programmé",
                  "planifié",
                ],
                onSelect: () => router.push("/routines"),
              },
            ]
          : []),
         {
          key: "go-all-global",
          label: t("allIssues"),
          icon: BOARD_ICON,
          href: "/all",
          keys: ["G", "B"],
          entityType: "navigation",
          onSelect: () => router.push("/all"),
        },
        {
          // The cycle is personal and cross-project: it lives on /all in mode
          // cycle (MIN-32), never assigned to a project — same destination as
          // the ↗ boards tab and the home map.
          key: "go-cycle",
          label: t("cycle"),
          icon: CycleIcon,
          href: "/all?view=cycle",
          entityType: "navigation",
          keywords: [
            "cycle",
            "sprint",
            "semaine",
            "week",
            "quinzaine",
            "fortnight",
            "itération",
            "iteration",
          ],
          onSelect: () => router.push("/all?view=cycle"),
        },
        {
          key: "go-account-settings",
          label: t("accountSettings"),
          icon: Settings01Icon,
          href: "/settings",
          entityType: "navigation",
          onSelect: () => router.push("/settings"),
        },
        {
          // Take out your tickets in CSV — the gesture you come to look for in ⌘K
          // at Linear, and that we were therefore looking for here. The dialogue asks for
          // project and statutes; this line assumes nothing.
          key: "export-issues",
          label: tExport("title"),
          icon: Download01Icon,
          keywords: [
            "export",
            "exporter",
            "csv",
            "excel",
            "tableur",
            "spreadsheet",
            "download",
            "télécharger",
            "telecharger",
            "backup",
            "sauvegarde",
            "sortir",
          ],
          onSelect: openExport,
        },
        {
          key: "keyboard-shortcuts",
          label: tk("shortcutsTitle"),
          icon: KeyboardIcon,
          keys: ["?"],
          keywords: ["keyboard", "shortcuts", "raccourcis", "clavier", "cheatsheet", "help", "aide"],
          onSelect: () => setCheatsheetOpen(true),
        },
      ],
    });

    if (switcherProjects.length > 0) {
      // ── Projects (quick switch) ─────────────────────────────────────
      groups.push({
        key: "projects",
        heading: t("projects"),
        items: switcherProjects.map((p) => ({
          key: `project-${p.id}`,
          label: p.name,
          icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
          keywords: [p.key],
          entityType: "project",
          contextId: p.id,
          data: p,
          href: `/projects/${p.id}`,
          onSelect: () => router.push(`/projects/${p.id}`),
        })),
      });

      // ── Pages (per-project navigation) ──────────────────────────────
      const pageItems: PaletteItem[] = [];
      for (const p of switcherProjects) {
        const base = `/projects/${p.id}`;
        const chip = projectChip(p);
        const metaText = p.name;
        const kw = [p.name, p.key];
        // contextId: with several projects the same five page names repeat, so
        // the current project's copies are the ones that should rank first.
        const contextId = p.id;
        pageItems.push(
          {
            key: `pg-tickets-${p.id}`,
            label: t("tickets"),
            icon: BOARD_ICON,
            keywords: kw,
            meta: chip,
            metaText,
            href: base,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(base),
          },
          {
            key: `pg-obj-${p.id}`,
            label: t("objectives"),
            icon: Target01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/objectives`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/objectives`),
          },
          // Between Objectives and Triage, as in the sidebar: the palette says
          // the screens of a project in the order in which they are seen.
          {
            key: `pg-pages-${p.id}`,
            label: t("pages"),
            icon: File02Icon,
            keywords: [...kw, "wiki", "documentation", "doc"],
            meta: chip,
            metaText,
            href: `${base}/pages`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/pages`),
          },
          {
            key: `pg-triage-${p.id}`,
            label: t("triage"),
            icon: CircleDotDashedIcon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/triage`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/triage`),
          },
          {
            key: `pg-feedback-${p.id}`,
            label: t("feedback"),
            icon: MessageMultiple01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/feedback`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/feedback`),
          },
          {
            key: `pg-set-${p.id}`,
            label: t("projectSettings"),
            icon: Settings01Icon,
            keywords: kw,
            meta: chip,
            metaText,
            href: `${base}/settings`,
            contextId,
            entityType: "navigation",
            onSelect: () => router.push(`${base}/settings`),
          },
        );
      }

      // “Go to” and not “Pages”: since MIN-270, a Page is an object of the
      // product (the wiki of a project). Keep this word for the SCREENS group
      // would put two different things under the same title, in the same list.
      groups.push({ key: "pages", heading: t("goTo"), items: pageItems });
    }

    return groups;
  }, [projects, switcherProjects, projectById, projectDrafts, openProjectDraft, creationDrafts, tDrafts, currentProject, createPageFromPalette, createPageInNewTab, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, openAssistant, agentsAllowed, projectLimitReached, openExport, locale, t, ti, tk, tPages, tScratch, tSettings, tExport, tProjects, setCheatsheetOpen]);

  // ── Settings: one line per CARD, not per tab ───────────────────────
  // A settings tab is a column of cards; “Cadence”, “Zone
  // sensitive” or “Act on your behalf” are not tabs, and they are
  // yet these words we type. Choosing a line therefore opens the correct page,
  // y selects the correct tab, scrolls down to the map and highlights it
  // (lib/settings-sections.ts → components/settings-shell.tsx).
  //
  // The project offered is THAT OF THE PAGE, and it alone: ​​the same thirteen
  // repeated sections for each project would swamp the list, while “the
  // settings of this project” is what we are looking for from inside a project.
  // To set another one, the “Project Settings” line in the Pages group
  // (she, offered for all) takes there first.
  const settingsSections = useSettingsSections();
  const settingsGroups = useMemo<PaletteGroup[]>(() => {
    const row = (s: SettingsSection, project: Project | null): PaletteItem => ({
      key: `settings-${s.id}`,
      label: s.title,
      icon: s.icon,
      keywords: [
        ...s.keywords,
        // The tab is a search term in its own right: “cycles” must
        // find “Cadence”, which doesn’t have the word anywhere.
        s.tabLabel,
        // A single setting is also found by the card that holds it.
        ...(s.parentTitle ? [s.parentTitle] : []),
        ...(project ? [project.name, project.key] : []),
      ],
      // No trailing text: the tab name is noise on the row (it is in the
      // search keywords), and the project orb comes from `contextId`.
      contextId: project?.id,
      href: settingsSectionHref(s, project?.id),
      entityType: "navigation",
      onSelect: () => router.push(settingsSectionHref(s, project?.id)),
    });

    const groups: PaletteGroup[] = [
      {
        key: "settings-account",
        heading: t("accountSettings"),
        items: settingsSections
          .filter((s) => s.scope === "account")
          .map((s) => row(s, null)),
      },
    ];

    if (currentProject) {
      // “Leave project” and “Sensitive area” are mutually exclusive:
      // offering the second to someone who is not an owner would take them to a
      // tab where it does not exist.
      const isOwner = currentProject.owner_id === user?.id;
      groups.push({
        key: "settings-project",
        heading: t("projectSettings"),
        items: settingsSections
          .filter(
            (s) =>
              s.scope === "project" &&
              (!s.audience || s.audience === (isOwner ? "owner" : "member")),
          )
          .map((s) => row(s, currentProject)),
      });
    }

    return groups;
  }, [settingsSections, currentProject, user, router, t]);

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
        href: `/projects/${page.project_id}/pages/${page.id}`,
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
                href: `/projects/${i.project_id}?issue=${i.id}`,
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
                href: `/projects/${o.project_id}/objectives?open=${o.id}`,
                onSelect: () =>
                  router.push(`/projects/${o.project_id}/objectives?open=${o.id}`),
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


  const inboxItem: AppNavItem = {
    key: "inbox",
    label: t("inbox"),
    icon: InboxIcon,
    onClick: openInbox,
    shortcut: "I",
    // The one counter that asks for attention (MIN-727): a filled pill.
    badge: inboxCount > 0
      ? <NotificationBadge count={inboxCount} label={t("inboxBadge", { count: inboxCount })} />
      : undefined,
  };

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
        items: [
          ...listedProjects.map((p) => {
            // A single number for both halves of the line: enter the
            // project breaks it down into its Triage and Feedback tabs, and the
            // total must land there exactly.
            const toTriage = triageCountTotal(triageCounts[p.id]);
            return {
              key: `project-${p.id}`,
              label: p.name,
              icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
              href: `/projects/${p.id}`,
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
    [pathname, inboxCount, openPrCount, projects, listedProjects, projectDrafts, openProjectDraft, triageCounts, openCreateProject, openCreateIssue, agentsAllowed, projectLimitReached, smartAssignBadge, projectContext.projectActions, user?.id, t, tProjects]
  );

  const sections = useMemo<AppNavSection[]>(() => {
    if (!currentProject) return homeSections;
    const base = `/projects/${currentProject.id}`;
    return [
        {
          // Project mode keeps ONLY the project context: back home, the
          // project switcher, and the project's own items (MIN-546 review).
          items: [
            {
              key: "home-back",
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
          items: [
            {
              key: "tickets",
              label: t("tickets"),
              icon: BOARD_ICON,
              href: base,
              active: pathname === base && !objectiveBoardId,
              // P (project) — B is the all-project board, from a project too.
              shortcut: "P",
              contextActions: projectContext.tabActions(currentProject, "tickets"),
            },
            {
              key: "objectives",
              label: t("objectives"),
              icon: Target01Icon,
              href: `${base}/objectives`,
              active:
                pathname.startsWith(`${base}/objectives`) || !!objectiveBoardId,
              shortcut: "O",
              descends: true,
              contextActions: projectContext.tabActions(currentProject, "objectives"),
            },
            // Between Objectives and Triage: the project wiki can be read with what
            // says WHERE the project is GOING, and not with the files that we empty. Sorting,
            // Returns and their pellets remain grouped at the bottom, where they are
            // checks when looking for pending work.
            {
              key: "pages",
              label: t("pages"),
              icon: File02Icon,
              href: `${base}/pages`,
              active: pathname.startsWith(`${base}/pages`),
              shortcut: "W",
              descends: true,
              contextActions: projectContext.tabActions(currentProject, "pages"),
            },
            {
              key: "triage",
              label: t("triage"),
              icon: TriageNavIcon,
              href: `${base}/triage`,
              active: pathname.startsWith(`${base}/triage`),
              shortcut: "T",
              descends: true,
              ...countBadges(
                triageCount,
                t("triageBadge", { count: triageCount })
              ),
            },
            {
              key: "feedback",
              label: t("feedback"),
              icon: MessageMultiple01Icon,
              href: `${base}/feedback`,
              active: pathname.startsWith(`${base}/feedback`),
              shortcut: "F",
              descends: true,
              contextActions: projectContext.tabActions(currentProject, "feedback"),
              ...countBadges(
                feedbackCount,
                t("feedbackBadge", { count: feedbackCount })
              ),
            },
            {
              key: "settings",
              label: t("projectSettings"),
              icon: Settings01Icon,
              href: `${base}/settings`,
              active: pathname.startsWith(`${base}/settings`),
              shortcut: "S",
              descends: true,
            },
          ],
        },
      ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, homeSections, pathname, objectiveBoardId, triageCount, feedbackCount, homeBadge, projectContext.tabActions, t]);

  // Inbox is a compact top control on desktop. Mobile keeps the regular row,
  // where there is no primary sidebar to host that control.
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
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";
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
      ...commandGroups,
      ...settingsGroups,
      ...desktopDataGroups,
      accountCommandGroup,
    ],
    [commandGroups, settingsGroups, desktopDataGroups, accountCommandGroup]
  );

  const mobileNavigation = useMemo(() => {
    const settingsPanel = (project?: Project): MobileMenuPanel => ({
      key: `settings-${project?.id ?? "account"}`,
      title: project ? t("projectSettings") : t("accountSettings"),
      sidebarRoute: project ? `/projects/${project.id}/settings` : "/settings",
      render: (navigation: MobileMenuNavigation) => <MobileSettingsMenu {...navigation} projectId={project?.id} />,
      // Back from a project's settings returns to its panel, else to Home.
      backBadge: project ? projectBackBadge(project.id) : homeBackBadge,
    });
    const panels = new Map<string, MobileMenuPanel>();
    projects.forEach((project) => {
      const base = `/projects/${project.id}`;
      const resource = (kind: "objectives" | "pages" | "triage" | "feedback"): MobileMenuPanel => ({ key: `${project.id}-${kind}`, title: t(kind), sidebarRoute: kind === "pages" && pathname.startsWith(`${base}/pages`) ? pathname : `${base}/${kind}`,
        render: (navigation: MobileMenuNavigation) => <MobileProjectMenu {...navigation} projectId={project.id} kind={kind} />,
        backBadge: projectBackBadge(project.id) });
      panels.set(project.id, { key: `project-${project.id}`, title: project.name, project, sections: [{ items: [
        { key: "tickets", label: t("tickets"), contextActions: projectContext.tabActions(project, "tickets"), icon: menuIcon(BOARD_ICON), href: base, active: pathname === base && !objectiveBoardId },
        { key: "objectives", label: t("objectives"), contextActions: projectContext.tabActions(project, "objectives"), icon: menuIcon(Target01Icon), panel: resource("objectives"), active: pathname.startsWith(`${base}/objectives`) || (currentProject?.id === project.id && !!objectiveBoardId) },
        { key: "pages", label: t("pages"), contextActions: projectContext.tabActions(project, "pages"), icon: menuIcon(File02Icon), panel: resource("pages"), active: pathname.startsWith(`${base}/pages`) },
        { key: "triage", label: t("triage"), icon: menuIcon(TriageNavIcon), panel: resource("triage"), active: pathname.startsWith(`${base}/triage`), ...countBadges(triageCounts[project.id]?.triage ?? 0, t("triageBadge", {count: triageCounts[project.id]?.triage ?? 0})) },
        { key: "feedback", label: t("feedback"), contextActions: projectContext.tabActions(project, "feedback"), icon: menuIcon(MessageMultiple01Icon), panel: resource("feedback"), active: pathname.startsWith(`${base}/feedback`), ...countBadges(triageCounts[project.id]?.feedback ?? 0, t("feedbackBadge", {count: triageCounts[project.id]?.feedback ?? 0})) },
        { key: "settings", label: t("projectSettings"), icon: menuIcon(Settings01Icon), panel: settingsPanel(project), active: pathname.startsWith(`${base}/settings`) },
      ] }] });
    });
    const root = toMenuSections(homeSections).map((section) => ({ ...section,
      items: section.items.map((item) => ({ ...item,
        panel: item.key.startsWith("project-") ? panels.get(item.key.slice("project-".length))
          : item.key === "routines" ? { key: "routines", title: t("routines"), sidebarRoute: "/routines", backBadge: homeBackBadge, render: (navigation: MobileMenuNavigation) => <MobileRoutinesMenu {...navigation} /> }
          : item.key === "pull-requests" ? { key: "pull-requests", title: t("pullRequests"), sidebarRoute: "/pull-requests", backBadge: homeBackBadge, render: (navigation: MobileMenuNavigation) => <MobilePullRequestsMenu {...navigation} /> }
          : undefined,
      })),
    }));
    const projectPanel = currentProject ? panels.get(currentProject.id) : undefined;
    const resourcePanel = projectPanel?.sections?.flatMap((section) => section.items).find((item) => item.panel && item.active)?.panel;
    const globalPanel = root.flatMap((section) => section.items).find((item) => item.panel?.sidebarRoute === pathname)?.panel
      ?? (pathname === "/settings" ? settingsPanel() : pathname === "/trash" || pathname === "/admin" ? { key: pathname, title: t(pathname === "/trash" ? "trash" : "adminDashboard"), sidebarRoute: pathname, backBadge: homeBackBadge } : undefined);
    return { sections: root, projects: switcherProjects, homeBadge, homeBadgeLabel, initialPanels: projectPanel ? [projectPanel, ...(resourcePanel ? [resourcePanel] : [])] : globalPanel ? [globalPanel] : [] };
    // `homeBadge` is a fresh element each render; `toSortEverywhere` and the
    // Smart Assign warnings it is built from are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, switcherProjects, homeSections, currentProject, pathname, objectiveBoardId, triageCounts, projectContext.tabActions, t, projectBackBadge, homeBackBadge, homeBadgeLabel, toSortEverywhere, smartAssignWarnings.length]);

  // Opening the palette arms the cross-project index if idle hasn't yet, and
  // revalidates it when the snapshot has aged (no-op while fresh).
  const handlePaletteOpenChange = useCallback(
    (next: boolean) => {
      if (next) warmPalette();
      setPaletteMode("default");
      setPaletteOpen(next);
      if (!next) return;
      armSearchIndex();
      refreshSearchIndex();
    },
    [armSearchIndex, refreshSearchIndex, warmPalette]
  );
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
  const handlePaletteContentOpenChange = useCallback((next: boolean) => {
    setPaletteOpen(next);
    if (!next) setPaletteMode("default");
  }, []);
  const handleDestinationSelect = useCallback((href: string) => {
    setPaletteOpen(false);
    setPaletteMode("default");
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
      <AppTopBar
        ready={Boolean(appTabSession)}
        hidden={sidebarHidden}
        inbox={inboxItem}
        onSearch={() => handlePaletteOpenChange(true)}
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
          onSearch={() => handlePaletteOpenChange(true)}
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
