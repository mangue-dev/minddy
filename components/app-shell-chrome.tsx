"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AppShell,
  MobileNav,
  cn,
  toast,
} from "mangue-ui";
import {
  Home,
  ChevronLeft,
  Plus,
  Inbox,
  LayoutGrid,
  Target,
  CircleDotDashed,
  MessagesSquare,
  Settings,
  ListTodo,
  Keyboard,
  CalendarClock,
  GitPullRequest,
  NotebookPen,
  IterationCw,
  Brush,
  TriangleAlert,
  Download,
  FileClock,
  FileText,
  Trash2,
} from "lucide-react";
import { InboxPopover } from "@/components/inbox-popover";
import { openInbox } from "@/lib/inbox-launcher";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useNotifications } from "@/lib/use-notifications";
import { useMyInvitations } from "@/lib/use-invitations-query";
import { issuesQueryFn } from "@/lib/issues-api";
import { useSearchIndex } from "@/lib/use-search-index";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { forgetDraftPage, markDraftPage } from "@/lib/pages-draft";
import {
  pageHref,
  pagesHref,
  pushPagesHistory,
  replacePagesHistory,
} from "@/lib/pages-navigation";
import {
  useOpenPullRequestCountQuery,
} from "@/lib/use-agent-runs";
import { useSmartAssignWarningsQuery } from "@/lib/use-smart-assign-warnings-query";
import { useTriageCountsQuery, triageCountTotal } from "@/lib/use-triage-counts-query";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  type PaletteGroup,
  type PaletteItem,
} from "@/components/header-search-pill";
import { usePlanGates } from "@/lib/use-billing-query";
import { MobileNavActions } from "@/components/mobile-nav-actions";
import { MobileMenuFooter, useAccountActions } from "@/components/mobile-account";
import { AppTopBar } from "@/components/app-top-bar";
import { useOptionalAppTabs } from "@/lib/app-tabs-context";
import { useAppTabChange } from "@/lib/use-app-tab-change";
import { HeaderWindowButtonsSlot } from "@/components/desktop-window-buttons";
import { ProjectOrb, projectOrbIcon } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { NumoIcon } from "@/components/numo-icon";
import {
  AppSidebar,
  EXPANDED_WIDTH,
  type AppNavItem,
  type AppNavSection,
} from "@/components/app-sidebar";
import { SidebarNavOverlay } from "@/components/sidebar-nav-overlay";
import {
  settingsSectionHref,
  useSettingsSections,
  type SettingsSection,
} from "@/lib/settings-sections";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { useSidebarVisibility } from "@/lib/sidebar-visibility-context";
import { useBranchCleanupTargets } from "@/lib/use-branch-cleanup-targets";
import { useCommandPaletteLauncher } from "@/lib/use-command-palette-launcher";
import type {
  BranchCleanupTarget,
  PageSearchHit,
  Project,
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexPage,
} from "@/lib/types";
import { usePageContentSearch } from "@/lib/use-page-search";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { objectiveIdFromBoardLocation } from "@/lib/objective-board-route";
import { draftIconUrl, draftOrbSeed } from "@/lib/project-draft";
import {
  useIssuePanelActions,
  useIssuePanelTarget,
} from "@/lib/issue-panel-context";
import {
  loadCommandPalette,
  loadGlobalIssuePanel,
  loadIssueSidePanel,
  loadScratchpadModal,
  preloadSurface,
} from "@/lib/lazy-app-surfaces";

/**
 * How many rows from OTHER projects the mobile surfaces get, per data group.
 *
 * The desktop palette is virtualized (react-window mounts only visible rows),
 * so it takes the whole list. mangue-ui's MobileNav is not: its cmdk search
 * sheet and its "⋯" menu mount every item they're given, and cross-project
 * search would hand them thousands.
 */
const MOBILE_CROSS_PROJECT_ROWS = 100;

/** The project the user is in, complete (exactly what mobile had before
 *  MIN-91), plus the most recently updated rows from the other projects.
 *  `rows` arrives current-project-first, index order after (mergeByProject). */
function capForMobile<T extends { project_id: string }>(
  rows: T[],
  currentProjectId: string | null
): T[] {
  const capped: T[] = [];
  let others = 0;
  for (const r of rows) {
    if (currentProjectId && r.project_id === currentProjectId) {
      capped.push(r);
    } else if (others < MOBILE_CROSS_PROJECT_ROWS) {
      others++;
      capped.push(r);
    }
  }
  return capped.length === rows.length ? rows : capped;
}

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

/** Keeps panel state updates out of the large app-shell render path. */
function GlobalIssuePanelHost() {
  const target = useIssuePanelTarget();
  const { closeIssue } = useIssuePanelActions();
  if (!target) return null;
  return (
    <GlobalIssuePanel
      key={`${target.projectId}:${target.issueId}`}
      projectId={target.projectId}
      issueId={target.issueId}
      onClose={closeIssue}
    />
  );
}

const BranchCleanupDialog = dynamic(
  () =>
    import("@/components/settings/git-branch-cleanup").then(
      (m) => m.BranchCleanupDialog,
    ),
  { ssr: false },
);

/** Right-aligned project tag shown on palette rows (orb + name), AutoKap-style. */
function projectChip(project: Project) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-3.5" />
      <span className="max-w-[9rem] truncate">{project.name}</span>
    </span>
  );
}

// The palette icon slot renders `<Icon className="size-4 …" />` with no way to
// pass a color, so we hand it a per-color component (the objective's dot, like
// on the objectives page). Cache by color to keep component identity stable
// across renders — otherwise the dot remounts (mirrors projectOrbIcon).
const objectiveDotCache = new Map<string, ComponentType<{ className?: string }>>();

function objectiveDotIcon(color: string | null): ComponentType<{ className?: string }> {
  const key = color ?? "none";
  const cached = objectiveDotCache.get(key);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <span className={cn("flex items-center justify-center", className)} aria-hidden>
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
    </span>
  );
  Icon.displayName = `ObjectiveDotIcon(${key})`;
  objectiveDotCache.set(key, Icon);
  return Icon;
}

// The emoji of a wiki page, in the icon slot of the palette (MIN-270).
// Cached by emoji for the same reason as the objective point: slot
// receives a COMPONENT, and making a new one each time it is rendered would reassemble it.
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
  <CircleDotDashed className={className} strokeWidth={2.25} />
);
TriageNavIcon.displayName = "TriageNavIcon";

import { countBadge, countBadges } from "@/components/nav-badge";

/**
 * The mark of a draft project, in the exact place of the “to sort” counter
 * of a created project: this is the only point where the line differs, and the void there
 * would suggest a project without anything to sort.
 */
function draftBadge(label: string) {
  return <FileClock className="size-3.5 text-muted-foreground" aria-label={label} />;
}

/** Muted monospace identifier badge, e.g. "MIND-42". */
function identifierBadge(id: string) {
  return (
    <span className="font-mono text-[0.7rem] font-medium tabular-nums text-muted-foreground/70">
      {id}
    </span>
  );
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const openAssistant = useAssistantPanel().open;
  const ti = useTranslations("Issue");
  const tk = useTranslations("Keyboard");
  const tScratch = useTranslations("Scratchpad");
  const tRoutines = useTranslations("Routines");
  const tSettings = useTranslations("Settings");
  const tExport = useTranslations("Export");
  const tBilling = useTranslations("Billing");
  const tProjects = useTranslations("Projects");
  const tPages = useTranslations("Pages");
  const { agentsAllowed, projectLimitReached } = usePlanGates();
  const pathname = usePathname();
  const appTabs = useOptionalAppTabs();
  const activeAppTabId = appTabs?.activeId;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const {
    projects,
    openCreateProject,
    projectDrafts,
    openProjectDraft,
    deleteProjectDraft,
  } = useProjects();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const { open: openScratchpad } = useScratchpad();
  const { unreadCount } = useNotifications();
  const {
    openIssue: openIssuePanel,
    closeIssue: closeIssuePanel,
  } = useIssuePanelActions();
  const previousPathname = useRef(pathname);
  useAppTabChange(closeIssuePanel);
  useEffect(() => {
    if (previousPathname.current !== pathname) closeIssuePanel();
    previousPathname.current = pathname;
  }, [pathname, closeIssuePanel]);
  // The inbox badge also counts pending invitations: they are there
  // display, and nothing else reports them once you leave the home.
  const { invitations } = useMyInvitations();
  const inboxCount = unreadCount + invitations.length;
  const navigateToWikiPage = useCallback(
    (projectId: string, pageId: string) => {
      const href = pageHref(projectId, pageId);
      const base = pagesHref(projectId);
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        pushPagesHistory(href);
      } else {
        router.push(href);
      }
    },
    [pathname, router]
  );
  const { setOpen: setCheatsheetOpen } = useCheatsheet();
  const { hidden: sidebarHidden } = useSidebarVisibility();

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
  // Cleaning agent branches (MIN-102), offered in the SIN palette
  // ANYWHERE: one line per eligible project (owner + linked deposit +
  // branches pushed by the agent), not just for the project page.
  // A single request covers all my projects — cf. use-branch-cleanup-targets.
  const branchCleanupTargets = useBranchCleanupTargets();
  // The target SURVIVES closing (the dialogue plays its exit animation);
  // it is `branchCleanupOpen` which opens and closes.
  const [branchCleanup, setBranchCleanup] = useState<BranchCleanupTarget | null>(null);
  const [branchCleanupOpen, setBranchCleanupOpen] = useState(false);
  const openBranchCleanup = useCallback((target: BranchCleanupTarget) => {
    setBranchCleanup(target);
    setBranchCleanupOpen(true);
  }, []);

  // CSV export: only one pallet line, never per project — this is the
  // dialogue which requires scope, because “one project or all” is precisely
  // the question we ask ourselves when clicking. As for cleaning the branches, the
  // montage SURVIVES closing for the duration of the exit animation.
  const [exportMounted, setExportMounted] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
  const { objectives: projectObjectives, loading: objectivesLoading } =
    useObjectivesQuery(
      currentProjectId && (paletteOpen || !!objectiveBoardId)
        ? currentProjectId
        : null,
    );
  // The current project wiki pages, for ⌘K (MIN-270). Same cache as
  // the tree of the Pages tab: opening the tab does not ask for anything, and a page
  // fame there changes name in the palette without going back and forth.
  const { pages: wikiPages, createPage: createWikiPage } =
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
  const createPageFromPalette = useCallback(
    (projectId: string) => {
      void (async () => {
        try {
          const page = await createWikiPage({});
          markDraftPage(page.id);
          navigateToWikiPage(projectId, page.id);
          void page.settled.catch((err: unknown) => {
            forgetDraftPage(page.id);
            if (window.location.pathname === pageHref(projectId, page.id)) {
              replacePagesHistory(pagesHref(projectId));
            }
            toast.error(
              err instanceof Error ? err.message : tPages("createFailed")
            );
          });
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : tPages("createFailed")
          );
        }
      })();
    },
    [createWikiPage, navigateToWikiPage, tPages]
  );

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

  // And what titles cannot give: pages whose CONTENT
  // answers. A request to the server, late on typing, which enriches the
  // list already displayed instead of making it wait.
  const pageContentHits = usePageContentSearch(paletteOpen);

  const paletteObjectives = useMemo<SearchIndexObjective[]>(
    () =>
      mergeByProject(
        searchIndex?.objectives ?? [],
        currentProjectId,
        // An empty array means "this project has none" — but it also means "not
        // loaded yet", and replacing the index's rows with that would blink the
        // current project's objectives out of the list. Keep the index until the
        // real answer lands.
        objectivesLoading ? null : projectObjectives
      ),
    [searchIndex, currentProjectId, projectObjectives, objectivesLoading]
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
  const { warnings: smartAssignWarnings } = useSmartAssignWarningsQuery();
  const smartAssignBadge =
    smartAssignWarnings.length > 0 ? (
      <TriangleAlert
        className="size-3.5 text-amber-500"
        aria-label={t("smartAssignIncomplete")}
      />
    ) : undefined;

  // What's waiting to be sorted in each of my projects — tickets in triage +
  // open returns, the “To be sorted” queue at reception viewed by project. Out of a
  // project, the sidebar didn't show any of that: it lists the projects
  // without a single badge, and the sorting, moreover, remained invisible as long as we
  // didn't get into it. Each project line therefore now carries the sum
  // of the two counters that can be read on its tabs once inside.
  // From a project, the same information on OTHERS: the return entry
  // “Home” brings the total (that of the current project is already on its
  // their own tabs, two lines below).
  const triageElsewhere = useMemo(
    () =>
      Object.entries(triageCounts).reduce(
        (sum, [projectId, count]) =>
          projectId === currentProjectId ? sum : sum + triageCountTotal(count),
        0
      ),
    [triageCounts, currentProjectId]
  );
  // The “Home” entry therefore combines two marks. The corner of the icon does not hold
  // only ONE: the triangle passes in front, because an incomplete adjustment does not
  // Don't catch up alone where a line always ends up emptying.
  const homeBadge =
    smartAssignBadge || triageElsewhere > 0 ? (
      <span className="flex items-center gap-1.5">
        {smartAssignBadge}
        {triageElsewhere > 0
          ? countBadge(
              triageElsewhere,
              t("triageElsewhereBadge", { count: triageElsewhere })
            )
          : null}
      </span>
    ) : undefined;

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
        icon: ListTodo,
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
        icon: Target,
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
        icon: FileText,
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
      });
    } else {
      // Outside a project, creation is GENERIC: one "New issue" line and one
      // "New objective", not a line per project — the dialogs pick the
      // project themselves. The global single-key shortcuts always apply.
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: ListTodo,
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
          icon: Target,
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
        icon: Plus,
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
    groups.push({ key: "create", heading: t("create"), items: createItems });

    // ── Go to (global) ────────────────────────────────────────────────
    // Every shortcut below mirrors keyboard-context's runChord (G then key);
    // when a chord changes there, it changes here too.
    groups.push({
      key: "goto",
      heading: t("goTo"),
      items: [
        { key: "go-home", label: t("home"), icon: Home, href: "/home", keys: ["G", "H"], entityType: "navigation", onSelect: () => router.push("/home") },
        { key: "go-inbox", label: t("inbox"), icon: Inbox, keys: ["G", "I"], onSelect: openInbox },
        {
          key: "open-notes",
          label: tScratch("open"),
          icon: NotebookPen,
          keys: ["mod", "⇧", "K"],
          keywords: ["notes", "scratchpad", "todo", "tâches", "problems"],
          onSelect: () => openScratchpad("palette"),
        },
        ...(agentsAllowed
          ? [
              {
                key: "go-pull-requests",
                label: t("pullRequests"),
                icon: GitPullRequest,
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
                icon: CalendarClock,
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
          icon: LayoutGrid,
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
          icon: IterationCw,
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
          icon: Settings,
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
          icon: Download,
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
          icon: Keyboard,
          keys: ["?"],
          keywords: ["keyboard", "shortcuts", "raccourcis", "clavier", "cheatsheet", "help", "aide"],
          onSelect: () => setCheatsheetOpen(true),
        },
      ],
    });

    if (projects.length > 0) {
      // ── Projects (quick switch) ─────────────────────────────────────
      groups.push({
        key: "projects",
        heading: t("projects"),
        items: projects.map((p) => ({
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
      for (const p of projects) {
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
            icon: LayoutGrid,
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
            icon: Target,
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
            icon: FileText,
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
            icon: CircleDotDashed,
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
            icon: MessagesSquare,
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
            icon: Settings,
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

      // Housekeeping of agent branches (MIN-102) — an action, not a page, but
      // per project like the rest of the group, and reachable from anywhere: a
      // line per eligible project, with its chip, because a deletion of
      // branches must say which deposit it relates to.
      for (const target of branchCleanupTargets) {
        const p = projectById.get(target.project_id);
        if (!p) continue;
        pageItems.push({
          key: `pg-clean-branches-${p.id}`,
          label: tSettings("gitCleanBranches"),
          icon: Brush,
          keywords: [
            p.name,
            p.key,
            "git",
            "branches",
            "github",
            "gitlab",
            "nettoyer",
            "clean",
            "cleanup",
            "pull request",
            ...(target.repo_full_name ? [target.repo_full_name] : []),
          ],
          meta: projectChip(p),
          metaText: target.repo_full_name ?? p.name,
          contextId: p.id,
          onSelect: () => openBranchCleanup(target),
        });
      }

      // “Go to” and not “Pages”: since MIN-270, a Page is an object of the
      // product (the wiki of a project). Keep this word for the SCREENS group
      // would put two different things under the same title, in the same list.
      groups.push({ key: "pages", heading: t("goTo"), items: pageItems });
    }

    return groups;
  }, [projects, projectById, projectDrafts, openProjectDraft, currentProject, createPageFromPalette, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, openAssistant, agentsAllowed, projectLimitReached, branchCleanupTargets, openBranchCleanup, openExport, t, ti, tk, tPages, tScratch, tSettings, tExport, tProjects, setCheatsheetOpen]);

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
      pages: SearchIndexPage[],
      contentHits: PageSearchHit[] = []
    ): PaletteGroup[] => {
      const groups: PaletteGroup[] = [];

      // The identifier carries the project key (MIN-42 vs AKP-7), therefore one line
      // says where it comes from; `contextId` brings up the current project.
      if (issues.length > 0) {
        groups.push({
          key: "issues",
          heading: ti("entityPlural"),
          items: issues.flatMap((i) => {
            const project = projectById.get(i.project_id);
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
            const project = projectById.get(o.project_id);
            if (!project) return [];
            return [
              {
                key: `objective-${o.id}`,
                label: o.name,
                icon: objectiveDotIcon(o.color),
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
      // Two sources in one list, and that's intentional. The TITLES come from
      // the index (filtered as you type, serverless); the CONTENT comes from
      // Postgres, with the snippet that says why the page exits. The extract is
      // placed in `description`: the palette engine classifies a match of
      // title above a description match, so "found by its
      // title” passes before “cited in a body” without having to sort.
      // The row's right-aligned context stays the PROJECT NAME — the excerpt
      // is for ranking, never for display.
      //
      // A page found by its content but missing from the index (ceiling
      // reached, snapshot expired) is added to the list: the server comes
      // to say that it exists and that it responds.
      const excerptById = new Map(
        contentHits.map((hit) => [hit.id, hit.excerpt] as const)
      );
      const known = new Set(pages.map((p) => p.id));
      const extras: SearchIndexPage[] = contentHits
        .filter((hit) => !known.has(hit.id))
        .map((hit) => ({
          id: hit.id,
          project_id: hit.project_id,
          title: hit.title,
          icon: hit.icon,
          updated_at: hit.updated_at,
        }));

      const allPages = [...pages, ...extras];
      if (allPages.length > 0) {
        groups.push({
          key: "wiki-pages",
          heading: t("pages"),
          items: allPages.flatMap((page) => {
            const project = projectById.get(page.project_id);
            if (!project) return [];
            const excerpt = excerptById.get(page.id) ?? "";
            return [
              {
                key: `wiki-${page.id}`,
                label: page.title || tPages("untitled"),
                icon: page.icon ? emojiIcon(page.icon) : FileText,
                description: excerpt,
                keywords: [project.name, project.key],
                meta: projectChip(project),
                metaText: project.name,
                entityType: "page",
                contextId: page.project_id,
                data: page,
                href: `/projects/${page.project_id}/pages/${page.id}`,
                onSelect: () => navigateToWikiPage(page.project_id, page.id),
              },
            ];
          }),
        });
      }

      return groups;
    },
    [projectById, navigateToWikiPage, openIssuePanel, t, ti, tPages]
  );

  // Desktop: the full list, built only while the palette is open — closed, it
  // renders nothing, so building thousands of rows on every shell re-render
  // (notification polls, agent sessions…) would be pure waste.
  const desktopDataGroups = useMemo(
    () =>
      paletteOpen
        ? buildDataGroups(
            paletteIssues,
            paletteObjectives,
            palettePages,
            pageContentHits
          )
        : [],
    [
      paletteOpen,
      buildDataGroups,
      paletteIssues,
      paletteObjectives,
      palettePages,
      pageContentHits,
    ]
  );

  // Mobile: bounded, always ready (MobileNav's search sheet opens on its own).
  const mobileDataGroups = useMemo(
    () =>
      buildDataGroups(
        capForMobile(paletteIssues, currentProjectId),
        capForMobile(paletteObjectives, currentProjectId),
        capForMobile(palettePages, currentProjectId)
      ),
    [
      buildDataGroups,
      paletteIssues,
      paletteObjectives,
      palettePages,
      currentProjectId,
    ]
  );

  const inboxItem: AppNavItem = {
    key: "inbox",
    label: t("inbox"),
    icon: Inbox,
    onClick: openInbox,
    shortcut: "I",
    ...countBadges(inboxCount, t("inboxBadge", { count: inboxCount })),
  };

  // Verrous de plan (MIN-72) : Agents & Pull Requests restent visibles mais
  // grayed out when the plan does not include them; “New project” turns gray
  // ceiling. Shared by the two sidebar modes (project/home).
  const pullRequestsItem: AppNavItem = {
    key: "pull-requests",
    label: t("pullRequests"),
    icon: GitPullRequest,
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
  // the FAB (and its mobile navbar button), which carry the same activity
  // signals the item used to show. The palette entry and G J open the panel.
  const routinesItem: AppNavItem = {
    key: "routines",
    label: t("routines"),
    icon: CalendarClock,
    href: "/routines",
    active: isRoutines,
    shortcut: "U",
    descends: true,
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
  };

  const sections = useMemo<AppNavSection[]>(() => {
    if (currentProject) {
      const base = `/projects/${currentProject.id}`;
      return [
        {
          // Project mode keeps ONLY the project context: back home, the
          // project switcher, and the project's own items (MIN-546 review).
          items: [
            {
              key: "home-back",
              label: t("home"),
              icon: ChevronLeft,
              href: "/home",
              shortcut: "H",
              badge: homeBadge,
            },
          ],
        },
        {
          items: [
            {
              key: "tickets",
              label: t("tickets"),
              icon: LayoutGrid,
              href: base,
              active: pathname === base && !objectiveBoardId,
              // P (project) — B is the all-project board, from a project too.
              shortcut: "P",
            },
            {
              key: "objectives",
              label: t("objectives"),
              icon: Target,
              href: `${base}/objectives`,
              active:
                pathname.startsWith(`${base}/objectives`) || !!objectiveBoardId,
              shortcut: "O",
              descends: true,
            },
            // Between Objectives and Triage: the project wiki can be read with what
            // says WHERE the project is GOING, and not with the files that we empty. Sorting,
            // Returns and their pellets remain grouped at the bottom, where they are
            // checks when looking for pending work.
            {
              key: "pages",
              label: t("pages"),
              icon: FileText,
              href: `${base}/pages`,
              active: pathname.startsWith(`${base}/pages`),
              shortcut: "W",
              descends: true,
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
              icon: MessagesSquare,
              href: `${base}/feedback`,
              active: pathname.startsWith(`${base}/feedback`),
              shortcut: "F",
              descends: true,
              ...countBadges(
                feedbackCount,
                t("feedbackBadge", { count: feedbackCount })
              ),
            },
            {
              key: "settings",
              label: t("projectSettings"),
              icon: Settings,
              href: `${base}/settings`,
              active: pathname.startsWith(`${base}/settings`),
              shortcut: "S",
              descends: true,
            },
          ],
        },
      ];
    }
    return [
      {
        items: [
          inboxItem,
          pullRequestsItem,
          routinesItem,
          {
            key: "all-global",
            label: t("allIssues"),
            icon: LayoutGrid,
            href: "/all",
            active: pathname === "/all",
            shortcut: "B",
          },
          {
            key: "home",
            label: t("home"),
            icon: Home,
            href: "/home",
            active: pathname.startsWith("/home"),
            shortcut: "H",
            badge: smartAssignBadge,
          },
        ],
      },
      {
        items: [
          ...projects.map((p) => {
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
                  icon: <Trash2 className="size-4" />,
                  variant: "destructive",
                  onSelect: () => {
                    void deleteProjectDraft(d.id).catch((err: Error) =>
                      toast.error(err.message),
                    );
                  },
                },
              ],
            }),
          ),
          {
            key: "new-project",
            label: t("newProject"),
            icon: Plus,
            onClick: openCreateProject,
            disabled: projectLimitReached,
          },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, pathname, objectiveBoardId, projects, projectDrafts, openProjectDraft, deleteProjectDraft, inboxCount, triageCount, feedbackCount, triageCounts, openPrCount, openCreateProject, agentsAllowed, projectLimitReached, smartAssignBadge, homeBadge, t, tProjects]);

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

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";
  const [sidebarLayerOpen, setSidebarLayerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);

  // Account/global options (statistics, feedback, theme, sign out). On desktop
  // they live in the sidebar footer; on mobile they move into the menu sheet +
  // command palette from a single source so both stay in sync.
  const { menuSections: accountSections, commandGroup: accountCommandGroup } =
    useAccountActions();

  // Palette = orders + data + account (used by the desktop pill too). Tea
  // mobile menu sheet gains the account sections so it fully replaces the
  // sidebar, and takes the capped data groups.
  const paletteGroups = useMemo(
    () => [
      ...commandGroups,
      ...settingsGroups,
      ...desktopDataGroups,
      accountCommandGroup,
    ],
    [commandGroups, settingsGroups, desktopDataGroups, accountCommandGroup]
  );
  const mobilePaletteGroups = useMemo(
    () => [
      ...commandGroups,
      ...settingsGroups,
      ...mobileDataGroups,
      accountCommandGroup,
    ],
    [commandGroups, settingsGroups, mobileDataGroups, accountCommandGroup]
  );

  const mobileMenuSections = useMemo(
    () => [...sections, ...accountSections],
    [sections, accountSections]
  );

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
  useCommandPaletteLauncher({
    open: paletteOpen,
    onOpenChange: handlePaletteOpenChange,
  });
  const openDestinationPalette = useCallback(() => {
    warmPalette();
    setPaletteMode("destination");
    setPaletteOpen(true);
    armSearchIndex();
    refreshSearchIndex();
  }, [armSearchIndex, refreshSearchIndex, warmPalette]);
  const handlePaletteContentOpenChange = useCallback((next: boolean) => {
    setPaletteOpen(next);
    if (!next) setPaletteMode("default");
  }, []);
  const handleDestinationSelect = useCallback((href: string) => {
    setPaletteOpen(false);
    setPaletteMode("default");
    void appTabs?.session.create(href);
  }, [appTabs?.session]);

  return (
    <div className="app-workspace flex h-dvh w-full min-w-0 flex-col overflow-hidden">
      {appTabs && (
        <AppTopBar
          hidden={sidebarHidden}
          inbox={inboxItem}
          onSearch={() => handlePaletteOpenChange(true)}
          onSearchWarm={warmPalette}
          onNewTab={openDestinationPalette}
        />
      )}
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
            modeKey={modeKey}
            currentProject={currentProject}
            projects={projects}
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
        <MobileNav
          sections={mobileMenuSections}
          commandGroups={mobilePaletteGroups}
          actions={<MobileNavActions />}
          menuFooter={<MobileMenuFooter />}
          linkComponent={Link}
          searchPlaceholder={t("searchPlaceholder")}
          emptyMessage={t("noResults")}
        />
      }
    >
      <div id="app-tab-content" role={appTabs ? "tabpanel" : undefined} aria-labelledby={activeAppTabId ? `app-tab-${activeAppTabId}` : undefined} className="h-full min-h-0">{children}</div>
      {/* Command palette (⌘K / ⌘P / F, sidebar search) — same groups as
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
        />
      ) : null}
      <InboxPopover open={inboxOpen} onOpenChange={setInboxOpen} />
      <GlobalIssuePanelHost />
      {/* Cleaning of branches opened from the pallet (MIN-102) — the SAME
 dialog as the settings button, mounted here to be reachable
 from any page, on any of my projects. The key
 moves the dialog from one project to another, so its preview reloads. */}
      {branchCleanup && (
        <BranchCleanupDialog
          key={branchCleanup.project_id}
          projectId={branchCleanup.project_id}
          provider={branchCleanup.provider}
          open={branchCleanupOpen}
          onOpenChange={setBranchCleanupOpen}
        />
      )}
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
    </AppShell>
    </div>
  );
}
