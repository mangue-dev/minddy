"use client";

// The minddy command palette (built on @clement/command-palette, extracted from
// minddy v1). Opened by the header search pill and by ⌘K / ⌘P (VS Code reflex) /
// F. It consumes the same `paletteGroups` the mobile nav uses (create, go to,
// projects, pages, issues, objectives, account) so both stay in sync by construction.
// On top of that: tickets carry their status icon and a ⌘; action menu (statut,
// priority, effort, assigned, copy prompt, copy id) wired to the
// real API (updateIssueApi + react-query invalidation); the theme options collapse
// into a single “Change theme” submenu; “Log out” is omitted.
//
// Bulk mode (MIN-75): a board's selection pill opens the palette via
// useBulkActions; the list then shows the selection's options (Numo, change
// status/priority/effort/assignee/objectif, cycle in/out, lier deux tickets,
// delete) as plain rows in place of the normal content — configurable fields
// open the same inline form as "Change theme". The rows that depend on a
// single project (objectif, lien) or on a cycle are wired by the board only
// when the selection allows them, so an impossible action is never offered.
//
// Cross-project (MIN-91): the rows now cover every project, so a ticket's ⌘;
// actions can't assume it belongs to the project in the URL. Members and
// categories come from the ticket's OWN project (via the search index), the
// caches invalidated after a write are that project's, and “copy prompt”
// fetches the full ticket when the row is a light index row.
//
// Open state is owned by AppShellChrome (so the header pill and the shortcuts
// share it); this component is controlled via `open` / `onOpenChange`.

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AiAutoRotateIcon as CycleIcon, Cancel01Icon, CircleIcon, ComputerIcon, Copy01Icon, Delete02Icon, GitPullRequestIcon, Link02Icon, MoonIcon, SignalFull01Icon, StickyNote02Icon, Sun01Icon, Tag01Icon, Target01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import {
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useAppRouter } from "@/lib/use-app-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAccountTheme } from "@/lib/use-account-theme";
import {
  CommandPalette as CommandPaletteShell,
  type ActionProvider,
  type ActionResult,
  type CategoryDefinition,
  type ContextualAction,
  type FormSelectOption,
  type PaletteItem as CpPaletteItem,
  type PaletteItem,
  usePaletteStore,
} from "@/lib/command-palette";
import { semanticExtras } from "@/lib/issue-semantic-query";
import { issueSearchTier } from "@/lib/issue-search-order";
import { useSemanticIssueSearch } from "@/lib/use-semantic-issue-search";
import { SemanticSearchingHint } from "@/components/semantic-searching-hint";

/** Palette category of the issues found by meaning (MIN-718), always last. */
const SEMANTIC_CATEGORY = "semantic-issues";
/** Palette category of the task notebook's remaining tasks (MIN-725). */
const SCRATCHPAD_CATEGORY = "scratchpad-tasks";
import { NumoIcon } from "@/components/numo-icon";
import { AppIcon } from "@/components/icon";
import { projectOrbIcon } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ObjectiveStatusIndicator, StatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { OBJECTIVE_TEXT, objectiveTextStyle } from "@/components/objective-label";
import { useBulkActions } from "@/lib/bulk-actions-context";
import { useBulkPaletteMode } from "@/lib/use-bulk-palette-mode";
import { usePalettePickerMode } from "@/lib/palette-picker";
import { displayName } from "@/lib/display-name";
import { fetchIssueApi, updateIssueApi } from "@/lib/issues-api";
import { setIssueCategoriesApi } from "@/lib/categories-api";
import {
  PALETTE_NONE,
  assigneeOptions,
  categoryOptions,
  effortOptions,
  objectiveOptions,
  priorityOptions,
  statusOptions,
  toggleCategory,
} from "@/components/command-palette-options";
import { buildIssuePrompt } from "@/lib/issue-prompt";
import { loadOneIssuePromptContext } from "@/lib/issue-prompt-context";
import {
  issueWrites,
  mergeServerIssue,
  patchIssueEverywhere,
} from "@/lib/optimistic/issue-writes";
import { patchSearchIndexIssue } from "@/lib/use-search-index";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { useCreate } from "@/lib/create-context";
import { useProjects } from "@/lib/projects-context";
import { smartAssignFillsEmptyAssignee } from "@/lib/smart-assign-config";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { useMembersQuery } from "@/lib/use-members-query";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { useAnalytics } from "@/lib/use-analytics";
import { moveIssueGroupsToEnd } from "@/lib/command-palette/group-order";
import type { PaletteStrings } from "@/lib/command-palette/i18n";
import { createMinddyEntityActionsProvider } from "@/lib/command-palette/registry/providers/MinddyEntityActionsProvider";
import { paletteDestinationHref } from "@/lib/palette-destination";
import { queueSettingsSectionFocus } from "@/lib/settings-section-focus";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import type {
  Category,
  Issue,
  Member,
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexPage,
  SearchIndexResponse,
} from "@/lib/types";
import type { PaletteGroup, PaletteItem as GroupItem } from "@/components/header-search-pill";
import { usePageContentSearch } from "@/lib/use-page-search";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadSummary } from "@/lib/use-scratchpad-query";
import { scratchpadSearchTasks } from "@/lib/scratchpad-search";
import { shownMentionLabel } from "@/lib/mention-resolution";
import type { MentionLinkType } from "@/lib/mention-link";
import { withPageContentHits } from "@/lib/palette-page-hits";
import { orderObjectives } from "@/lib/objective-order";
import "./command-palette.css";

/** Search boosts by group — same philosophy as minddy v1:
 * the commands remain on top of the data with equal relevance. */
const GROUP_BOOSTS: Record<string, number> = {
  create: 300,
  goto: 250,
  projects: 200,
  pages: 150,
  // The settings are navigation, like the pages, but we look for them
  // less often than a board: just below. The project goes ahead of
  // counts because these lines ONLY exist when we are in a project —
  // having asked them is already having said which ones.
  "settings-project": 135,
  "settings-account": 130,
  // The admin dashboard (MIN-829): navigation an administrator looks for
  // less often than their own settings.
  admin: 120,
  account: 100,
  issues: 80,
  objectives: 80,
  // The wiki is DATA, like tickets and goals — not data.
  // navigation, despite the word “pages” which it shares with the group above
  // (MIN-276). Same level as them: with equal relevance, what we have written does not
  // go neither ahead nor behind what we have to do. The title ranking >
  // content itself is not decided here: it comes from the engine, which puts a
  // title match above a description match (the excerpt).
  "wiki-pages": 80,
  // Notebook tasks are data too, written by the user for themselves.
  [SCRATCHPAD_CATEGORY]: 80,
  // The workspace's other objects (MIN-846): data again, and search-only.
  // A notification only points at something else, so the object itself
  // ranks first when both answer the same words.
  routines: 80,
  "pull-requests": 80,
  "board-views": 80,
  notifications: 70,
};

/** Ticket status icon: the SAME indicator as board cards and
 * the side panel (dotted ring, progression pie, solid disk
 * to the hollowed-out glyph — cf. components/issue-indicators.tsx). The lucid glyphs of
 * `STATUS_MAP` / `PRIORITY_MAP` are the game before Figma design: the palette
 * was the last surface to display them, they are no longer read anywhere. */
function statusIcon(status: IssueStatus) {
  return <StatusIndicator status={status} className="size-4" />;
}

/** The same indicators, in COMPONENTS, for slots that expect a type
 * icon (`ContextualAction.icon`, rendered `<action.icon className=… />`).
 * Cached by value to keep a stable component identity of a
 * returned to the other — otherwise the line of action goes back with each strike. */
type IconOf<T> = (value: T) => ComponentType<{ className?: string }>;

function cachedIndicator<T>(
  name: string,
  render: (value: T, className?: string) => ReactNode
): IconOf<T> {
  const cache = new Map<T, ComponentType<{ className?: string }>>();
  return (value: T) => {
    const cached = cache.get(value);
    if (cached) return cached;
    const Icon = ({ className }: { className?: string }) => render(value, className);
    Icon.displayName = `${name}(${String(value)})`;
    cache.set(value, Icon);
    return Icon;
  };
}

const statusActionIcon = cachedIndicator<IssueStatus>(
  "StatusActionIcon",
  (status, className) => <StatusIndicator status={status} className={className} />
);

const priorityActionIcon = cachedIndicator<IssuePriority>(
  "PriorityActionIcon",
  (priority, className) => (
    <PriorityIndicator priority={priority} className={className} />
  )
);

/** A ticket such as the palette receives it: complete line of the board (project
 * current) or light line of the cross-project index (MIN-91). */
type PaletteIssue = Issue | SearchIndexIssue;

// PALETTE_NONE is the effort select's clear option: the issue's effort becomes unset.
function effortFromPalette(value: unknown): IssueEffort | null {
  return value === PALETTE_NONE ? null : (value as IssueEffort);
}

function effortPaletteLabel(value: unknown, noneLabel: string): string {
  return value === PALETTE_NONE ? noneLabel : String(value).toUpperCase();
}

/** Only board rows have `category_ids` (added by mapIssueRow) —
 * this is what distinguishes a complete ticket from an index line, devoid of
 * description and plan. */
function isFullIssue(issue: PaletteIssue): issue is Issue {
  return "category_ids" in issue;
}

/** Numo's face as a static action icon (no blinking in the popover). */
const NumoActionIcon = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">) => (
  <NumoIcon animated={false} {...props} />
);
NumoActionIcon.displayName = "NumoActionIcon";

export interface CommandPaletteProps {
  groups: PaletteGroup[];
  /** Controlled open state (owned by AppShellChrome). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cross-project index (MIN-91) — read here for the members and categories of
   *  projects other than the one in the URL, which the ⌘; actions need. */
  searchIndex?: SearchIndexResponse | null;
  destinationOnly?: boolean;
  onDestinationSelect?: (href: string) => void;
  /** Prefetch the destination behind a hovered/highlighted row (new tab or
   *  navigation): the palette row is the browsing intent (fourth pass MIN-540). */
  onPrefetchDestination?: (href: string) => void;
  /** Builds the row of a page that only the content search found. */
  pageItem?: (page: SearchIndexPage) => GroupItem | null;
}

export function CommandPalette({
  groups,
  open,
  onOpenChange,
  searchIndex,
  destinationOnly = false,
  onDestinationSelect,
  onPrefetchDestination,
  pageItem,
}: CommandPaletteProps) {
  const mobile = useMobileLayout() === true;
  const navigationSearch = destinationOnly || mobile;
  const { track } = useAnalytics();
  const locale = useLocale();
  const tIssueUI = useTranslations("IssueUI");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tBulk = useTranslations("BulkActions");
  const tPr = useTranslations("PullRequests");
  const tCycles = useTranslations("Cycles");
  const tNav = useTranslations("Nav");
  const tAction = useTranslations("CommandPaletteActions");
  const tScratch = useTranslations("Scratchpad");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const router = useAppRouter();
  const appTabs = useOptionalAppTabSession();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects } = useProjects();
  const assistant = useAssistantPanelActions();
  const { openCreateIssue, openCreateObjective } = useCreate();
  // The account theme: the choice is persisted to user_metadata so it
  // follows the account to every device (lib/use-account-theme.ts).
  const { theme, setTheme } = useAccountTheme();

  // Group selection (MIN-75): a board publishes its selection via context.
  // The “Actions” pill opens ⌘K in BULK MODE — the palette then displays the
  // selection options (Number, change status/priority/effort/assigned,
  // delete) like normal lines, instead of the usual content. THE
  // configurable fields open the inline form (the “submenu”, like
  // “Change the theme”).
  const { request: bulkRequest } = useBulkActions();
  const bulkMode = useBulkPaletteMode({ open, destinationOnly, onOpenChange });

  // Content picker (MIN-844): a surface asked the palette to pick what it
  // links (lib/palette-picker.ts). Its rows, groups and placeholder replace
  // everything else, bulk mode included, until the palette closes.
  const picker = usePalettePickerMode({ open, destinationOnly, onOpenChange });
  const showBulk = bulkMode && !picker;

  // One warmup attempt per destination while the palette stays mounted:
  // repeated hovers and keyboard passes over the same row cost nothing.
  const prefetchAttempted = useRef(new Set<string>());
  const handleHoverPrefetch = useCallback((item: PaletteItem) => {
    if (!onPrefetchDestination) return;
    // Issue rows open a panel, not a tab: their href would prefetch a
    // project route per row while scrolling the list. Destinations and pages
    // carry the real navigation.
    if (item.entityType === "issue") return;
    const destination = paletteDestinationHref(item.href);
    if (!destination || prefetchAttempted.current.has(destination)) return;
    prefetchAttempted.current.add(destination);
    onPrefetchDestination(destination);
  }, [onPrefetchDestination]);

  const currentProjectId = projectIdFromPath(pathname);
  const { members } = useMembersQuery(currentProjectId, !!currentProjectId);
  const { categories: projectCategories } = useCategoriesQuery(currentProjectId);

  // Categories of ALL my projects (uuid ids → globally unique, so one
  // only map is enough). Those of the current project overwrite the index: same
  // data, but kept up to date by realtime.
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(searchIndex?.categories ?? {})) {
      for (const c of list) map.set(c.id, c.name);
    }
    for (const c of projectCategories) map.set(c.id, c.name);
    return map;
  }, [searchIndex, projectCategories]);

  // Categories of the TICKET project, in settings order (both lists are read
  // by position): the live list of the current project, else the index.
  const categoriesForProject = useCallback(
    (projectId: string): Category[] => {
      if (projectId === currentProjectId && projectCategories.length > 0) return projectCategories;
      return searchIndex?.categories[projectId] ?? [];
    },
    [currentProjectId, projectCategories, searchIndex]
  );

  // Members of the DU TICKET project — the palette now lists tickets for
  // all projects, so the assignee can no longer come from the URL project.
  const membersForProject = useCallback(
    (projectId: string): Member[] => {
      if (projectId === currentProjectId && members.length > 0) return members;
      return searchIndex?.members[projectId] ?? [];
    },
    [currentProjectId, members, searchIndex]
  );

  // The cmdk groups become the categories of the palette (order preserved).
  // With an empty query the list follows this order, not `searchBoost`.
  // Tickets are the one exception: they always come after every command,
  // navigation target, setting, objective, and page so a large ticket index
  // cannot bury a more specific result.
  //
  // The task notebook's category has no group of its own: its rows are built
  // here, from the note (see `taskItems`).
  const categories = useMemo<CategoryDefinition[]>(
    () =>
      moveIssueGroupsToEnd([...groups, { key: SCRATCHPAD_CATEGORY, heading: tScratch("title") }]).map((g, i) => {
        const id = g.key ?? g.heading ?? `group-${i}`;
        return {
          id,
          label: g.heading ?? id,
          searchBoost: GROUP_BOOSTS[id] ?? 0,
        };
      }),
    [groups, tScratch]
  );

  const themeLabel = tNav("changeTheme");

  // Each cmdk PaletteItem becomes an item in the palette. metaText (id
  // PQ-42, project name) becomes the contextLabel dim; tickets receive
  // the (colored) icon of their status. The 3 flat theme options are
  // replaced by a single “Change theme” (select submenu) and
  // “Log out” is removed.
  // Project orb per project id: any row referencing a project (ticket,
  // page, create line…) shows it LEFT of its right-aligned context text.
  const projectIconById = useMemo(
    () => new Map(projects.map((p) => [p.id, projectOrbIcon(projectOrbSeed(p), p.icon_url)])),
    [projects]
  );

  const toPaletteItem = useCallback(
    (it: GroupItem, cat: string): CpPaletteItem => {
      const Icon = it.icon;
      const issue = it.entityType === "issue" ? (it.data as PaletteIssue) : null;
      // An objective: its status as the icon, its name in its color — no dot
      // (MIN-785).
      const objective = it.entityType === "objective" ? (it.data as SearchIndexObjective) : null;
      return {
        id: it.key,
        title: it.label,
        keywords: it.keywords,
        description: it.description,
        shortcut: it.keys,
        icon: issue
          ? statusIcon(issue.status)
          : objective
            ? <ObjectiveStatusIndicator status={objective.status} className="size-4" />
          : Icon
            ? <AppIcon icon={Icon} className="size-4" />
            : undefined,
        ...(objective
          ? { titleClassName: OBJECTIVE_TEXT, titleStyle: objectiveTextStyle(objective.color) }
          : {}),
        contextLabel: it.metaText,
        contextIcon: (() => {
          if (!it.contextId) return undefined;
          const ProjectIcon = projectIconById.get(it.contextId);
          return ProjectIcon ? <AppIcon icon={ProjectIcon} className="size-3.5" /> : undefined;
        })(),
        filterCategory: cat,
        searchOnly: it.searchOnly,
        // Issue search order (MIN-726): work under way first, closed and
        // triage issues last, the typed identifier before all.
        ...(issue
          ? {
              searchTier: issueSearchTier(issue.status),
              exactKeywords: [it.metaText, String((issue as { number?: number }).number ?? "")].filter(
                (keyword): keyword is string => Boolean(keyword),
              ),
            }
          : {}),
        entityType: it.entityType ?? (it.href ? "navigation" : undefined),
        // Line project: the motor boosts those of the current project
        // (SearchContext.currentContextId), without excluding others.
        contextId: it.contextId,
        data: it.data,
        href: it.href,
        execute: () => {
          // `it.key` is a stable identifier (cmd-*, ticket id) —
          // never the translated wording, which would fragment the stats.
          track("command_executed", { command_id: it.key, category: cat });
          const destination = paletteDestinationHref(it.href);
          if (destinationOnly && destination) {
            // A settings row lands on its card in the new tab too.
            queueSettingsSectionFocus(it.href);
            onDestinationSelect?.(destination);
          } else if (destinationOnly && it.onSelectInNewTab) {
            onOpenChange(false);
            it.onSelectInNewTab();
          } else it.onSelect?.();
        },
      };
    },
    [projectIconById, track, destinationOnly, onDestinationSelect, onOpenChange]
  );

  const items = useMemo<CpPaletteItem[]>(() => {
    const HIDDEN_KEYS = new Set(["cmd-light", "cmd-dark", "cmd-system", "cmd-signout"]);

    const mapped = groups.flatMap((g, gi) => {
      const cat = g.key ?? g.heading ?? `group-${gi}`;
      return g.items
        .filter((it) => {
          if (HIDDEN_KEYS.has(it.key)) return false;
          if (!navigationSearch || paletteDestinationHref(it.href) !== null) return true;
          if (destinationOnly && it.onSelectInNewTab) return true;
          // Tickets, notifications and navigation panels open in place without a tab destination.
          return mobile && !destinationOnly && (it.entityType === "issue" || it.entityType === "notification" || ["go-inbox", "open-notes", "go-agents", "cmd-shortcuts"].includes(it.key));
        })
        .map((it) => toPaletteItem(it, cat));
    });

    // “Change theme”: Enter/⌘; opens the select inline (provider "theme")
    if (!navigationSearch) mapped.push({
      id: "cmd-theme",
      title: themeLabel,
      keywords: ["theme", "thème", "apparence", "appearance", "dark", "light", "sombre", "clair"],
      icon: <HugeiconsIcon icon={Sun01Icon} className="size-4" />,
      filterCategory: "account",
      entityType: "theme",
    });

    return mapped;
  }, [groups, toPaletteItem, themeLabel, navigationSearch, mobile, destinationOnly]);

  // The task notebook (MIN-725): its remaining tasks answer a search, without
  // crowding the default list (`searchOnly`). Choosing one opens the notebook
  // on that task. The note comes
  // from the cache the header badge already keeps warm and live.
  const { open: openScratchpad } = useScratchpad();
  const { content: scratchpadContent } = useScratchpadSummary();
  // A typed mention reads as its target's CURRENT label (MIN-734): from the
  // rows this palette already holds, else what a pill on screen showed.
  const mentionLabel = useCallback(
    (type: MentionLinkType, id: string): string | null | undefined => {
      const local = (() => {
        switch (type) {
          case "project": return projects.find((p) => p.id === id)?.name;
          case "issue": return searchIndex?.issues.find((i) => i.id === id)?.title;
          case "objective": return searchIndex?.objectives.find((o) => o.id === id)?.name;
          case "page": return searchIndex?.pages.find((p) => p.id === id)?.title;
          case "member": {
            for (const list of Object.values(searchIndex?.members ?? {})) {
              const member = list.find((m) => m.user_id === id);
              if (member) return displayName(member);
            }
            return undefined;
          }
        }
      })();
      return local ?? shownMentionLabel(type, id);
    },
    [projects, searchIndex]
  );
  const taskItems = useMemo<CpPaletteItem[]>(() => {
    if (destinationOnly || !scratchpadContent) return [];
    return scratchpadSearchTasks(scratchpadContent, mentionLabel, tCommon("mentionUnavailable")).map((task) => ({
      id: `scratchpad-task-${task.index}`,
      title: task.text,
      icon: <HugeiconsIcon icon={StickyNote02Icon} className="size-4" />,
      contextLabel: task.section ?? undefined,
      keywords: task.section ? [task.section] : undefined,
      filterCategory: SCRATCHPAD_CATEGORY,
      entityType: "scratchpad-task",
      searchOnly: true,
      execute: () => {
        track("command_executed", { command_id: "scratchpad-task", category: SCRATCHPAD_CATEGORY });
        openScratchpad("palette", { taskIndex: task.index });
      },
    }));
  }, [destinationOnly, scratchpadContent, mentionLabel, tCommon, track, openScratchpad]);

  // Pages whose CONTENT answers the query (MIN-276), applied here rather than
  // in the shell: typing and search results only re-render the palette, and a
  // result rebuilds the matching page rows instead of the whole model.
  const pageContentHits = usePageContentSearch(open);
  const searchItems = useMemo(
    () =>
      withPageContentHits([...items, ...taskItems], pageContentHits, (page) => {
        const row = pageItem?.(page);
        return row ? toPaletteItem(row, "wiki-pages") : null;
      }),
    [items, taskItems, pageContentHits, pageItem, toPaletteItem]
  );

  // === Contextual issue actions (⌘; / →) ===
  // Each action opens an inline form with one field: the select opens
  // auto-focus, choose an auto-submit option → PATCH, the server line is
  // written in the caches of the TICKET project, the aggregated board and the index
  // cross-project (never an invalidation — MIN-156), toast.
  const issueProvider = useMemo<ActionProvider>(() => {
    const update = async (
      issue: PaletteIssue,
      updates: Parameters<typeof updateIssueApi>[1],
      message: string
    ): Promise<ActionResult> => {
      const handle = issueWrites.begin({
        kind: "patch",
        id: issue.id,
        patch: updates as Partial<Issue>,
      });
      let updated;
      try {
        updated = await updateIssueApi(issue.id, updates, {
          surface: "palette",
          previousStatus: issue.status,
        });
      } catch (err) {
        issueWrites.fail(handle);
        throw err;
      }
      // The index is the source of the line as soon as we are not in the project of the
      // ticket: without this patch, the status icon would remain the old one.
      patchSearchIndexIssue(queryClient, issue.id, updates as Partial<SearchIndexIssue>);
      mergeServerIssue(queryClient, issue.project_id, updated);
      issueWrites.settle(handle, updated);
      toast.success(message);
      // closeMenu:false → return to search, status icon updates
      return { success: true, closeMenu: false };
    };

    const selectField = (
      key: string,
      label: string,
      options: FormSelectOption[]
    ) => ({
      // No prefill: the empty field receives autofocus, therefore the dropdown
      // opens immediately and Enter on an auto-submit option.
      fields: [{ key, type: "select" as const, label, options }],
    });

    return {
      id: "issue-actions",
      handles: ["issue"],
      priority: 50,
      getActions: (item): ContextualAction[] => {
        const issue = item.data as PaletteIssue | undefined;
        if (!issue) return [];

        const actions: ContextualAction[] = [];

        // — Statut —
        actions.push({
          id: "issue.status",
          label: tIssueUI("changeStatusAria"),
          icon: statusActionIcon(issue.status),
          category: "secondary",
          priority: 40,
          requiresForm: {
            ...selectField(
              "status",
              tIssueUI("changeStatusAria"),
              statusOptions(tStatus, { current: issue.status })
            ),
            onSubmit: (values) =>
              update(
                issue,
                { status: values.status as IssueStatus },
                `${tIssueUI("changeStatusAria")} → ${tStatus(values.status as IssueStatus)}`
              ),
          },
        });

        // - Priority -
        actions.push({
          id: "issue.priority",
          label: tIssueUI("changePriorityAria"),
          icon: priorityActionIcon(issue.priority),
          category: "secondary",
          priority: 30,
          requiresForm: {
            ...selectField(
              "priority",
              tIssueUI("changePriorityAria"),
              priorityOptions(tPriority, { current: issue.priority })
            ),
            onSubmit: (values) =>
              update(
                issue,
                { priority: values.priority as IssuePriority },
                `${tIssueUI("changePriorityAria")} → ${tPriority(values.priority as IssuePriority)}`
              ),
          },
        });

        // — Effort —
        // Triangle: the board's effort glyph (EffortIndicator = triangle +
        // letter). The full indicator would not fit in this 16 px slot; the
        // options carry the triangle alone, as in the card's picker.
        actions.push({
          id: "issue.effort",
          label: tIssueUI("changeEffortAria"),
          icon: TriangleIcon,
          category: "secondary",
          priority: 20,
          requiresForm: {
            ...selectField(
              "effort",
              tIssueUI("changeEffortAria"),
              effortOptions(tField("effortNone"), { current: issue.effort })
            ),
            onSubmit: (values) =>
              update(
                issue,
                { effort: effortFromPalette(values.effort) },
                `${tIssueUI("changeEffortAria")} → ${effortPaletteLabel(values.effort, tField("effortNone"))}`
              ),
          },
        });

        // — Assigned —
        // Smart Assign fills an empty assignee here (MIN-811).
        const smartAssign = smartAssignFillsEmptyAssignee(
          projects.find((project) => project.id === issue.project_id)?.smart_assign_enabled,
          issue.status,
        );
        actions.push({
          id: "issue.assignee",
          label: tIssueUI("changeAssigneeAria"),
          icon: UserCircleIcon,
          category: "secondary",
          priority: 10,
          requiresForm: {
            ...selectField(
              "assignee",
              tIssueUI("changeAssigneeAria"),
              assigneeOptions(
                membersForProject(issue.project_id),
                { label: tField(smartAssign ? "smartAssign" : "unassigned"), smartAssign },
                { current: issue.assignee_id }
              )
            ),
            onSubmit: (values) =>
              update(
                issue,
                {
                  assignee_id:
                    values.assignee === PALETTE_NONE
                      ? null
                      : (values.assignee as string),
                },
                tIssueUI("changeAssigneeAria")
              ),
          },
        });

        // Picker order (MIN-785), counted on the project's cached tickets: the
        // search index rows carry no creation date.
        const projectObjectives = orderObjectives(
          (searchIndex?.objectives ?? []).filter(
            (objective) => objective.project_id === issue.project_id
          ),
          queryClient.getQueryData<Issue[]>(["issues", issue.project_id]) ?? []
        );
        actions.push({
          id: "issue.objective",
          label: tIssueUI("changeObjectiveAria"),
          icon: Target01Icon,
          category: "secondary",
          priority: 9,
          requiresForm: {
            ...selectField(
              "objective",
              tIssueUI("changeObjectiveAria"),
              objectiveOptions(projectObjectives, tField("noObjective"), {
                current: issue.objective_id,
              })
            ),
            onSubmit: (values) =>
              update(
                issue,
                {
                  objective_id:
                    values.objective === PALETTE_NONE
                      ? null
                      : (values.objective as string),
                },
                tIssueUI("changeObjectiveAria")
              ),
          },
        });

        // — Categories — a multi-value field in a single-select form: choosing
        // a category toggles it, and the form returns to search so another one
        // can follow. Index rows carry no category set; the project's cached
        // tickets usually do, otherwise the ticket is read before the write.
        const projectCategoryList = categoriesForProject(issue.project_id);
        const knownCategoryIds = isFullIssue(issue)
          ? issue.category_ids
          : queryClient
              .getQueryData<Issue[]>(["issues", issue.project_id])
              ?.find((row) => row.id === issue.id)?.category_ids;
        if (projectCategoryList.length > 0) {
          actions.push({
            id: "issue.categories",
            label: tIssueUI("editCategoriesAria"),
            icon: Tag01Icon,
            category: "secondary",
            priority: 8,
            requiresForm: {
              ...selectField(
                "category",
                tIssueUI("editCategoriesAria"),
                categoryOptions(projectCategoryList, knownCategoryIds)
              ),
              onSubmit: async (values): Promise<ActionResult> => {
                let current = knownCategoryIds;
                try {
                  current ??= (await fetchIssueApi(issue.id)).category_ids;
                } catch (err) {
                  toast.error((err as Error).message);
                  return { success: false, closeMenu: false };
                }
                const categoryId = values.category as string;
                const next = toggleCategory(current, categoryId);
                const handle = issueWrites.begin({
                  kind: "patch",
                  id: issue.id,
                  patch: { category_ids: next },
                });
                patchIssueEverywhere(queryClient, issue.project_id, issue.id, { category_ids: next });
                try {
                  await setIssueCategoriesApi(issue.id, next);
                } catch (err) {
                  issueWrites.fail(handle);
                  patchIssueEverywhere(queryClient, issue.project_id, issue.id, { category_ids: current });
                  throw err;
                }
                // The PUT returns no row: the written set is the truth, and
                // realtime reconciles the rest.
                issueWrites.settle(handle);
                const name = projectCategoryList.find((c) => c.id === categoryId)?.name ?? "";
                toast.success(`${tIssueUI("editCategoriesAria")} → ${name}`);
                return { success: true, closeMenu: false };
              },
            },
          });
        }

        // — Copy the prompt (the ⇧P of the board: XML agent + auto-start MIN-20) —
        actions.push({
          id: "issue.copy-prompt",
          label: tIssueUI("copyAsPrompt"),
          icon: Copy01Icon,
          category: "secondary",
          priority: 5,
          execute: async (): Promise<ActionResult> => {
            const project = projects.find((p) => p.id === issue.project_id);
            // The prompt describes the ENTIRE ticket (description, deadline, etc.): a
            // index line does not have one, so we go and get the ticket.
            let full: Issue;
            try {
              full = isFullIssue(issue) ? issue : await fetchIssueApi(issue.id);
            } catch (err) {
              toast.error((err as Error).message);
              return { success: false, closeMenu: false };
            }
            const autoStart =
              resolvePromptCopyAutoStart(user?.user_metadata) &&
              shouldAutoStartOnPromptCopy(full.status);
            // The copied XML reflects the state AFTER auto-start (as on the board)
            const promptIssue = autoStart
              ? { ...full, status: "in_progress" as const }
              : full;
            const promptCategories = full.category_ids
              .map((cid) => categoryNameById.get(cid))
              .filter((name): name is string => !!name);
            const prompt = buildIssuePrompt({
              issue: promptIssue,
              projectId: full.project_id,
              projectKey: project?.key ?? "",
              categories: promptCategories,
              // Unresolved relationships here (board data) — block omitted from prompt
              resourceCount: full.resource_count,
              ...(await loadOneIssuePromptContext(full.id)),
            });
            await navigator.clipboard.writeText(prompt);
            if (autoStart) {
              const handle = issueWrites.begin({
                kind: "patch",
                id: full.id,
                patch: { status: "in_progress" },
              });
              let started;
              try {
                started = await updateIssueApi(
                  full.id,
                  { status: "in_progress" },
                  { surface: "palette", previousStatus: full.status }
                );
              } catch (err) {
                issueWrites.fail(handle);
                throw err;
              }
              patchSearchIndexIssue(queryClient, full.id, { status: "in_progress" });
              mergeServerIssue(queryClient, full.project_id, started);
              issueWrites.settle(handle, started);
              toast.success(tIssueUI("promptCopiedMoved"));
            } else {
              toast.success(tIssueUI("promptCopied"));
            }
            return { success: true, closeMenu: false };
          },
        });

        // Copy the stable human identifier (for example, PQ-42).
        if (item.contextLabel) {
          actions.push({
            id: "issue.copy-id",
            label: tAction("copyIdentifier", { identifier: item.contextLabel }),
            icon: Copy01Icon,
            category: "secondary",
            priority: 0,
            execute: async (): Promise<ActionResult> => {
              await navigator.clipboard.writeText(item.contextLabel as string);
              toast.success(item.contextLabel as string);
              return { success: true, closeMenu: false };
            },
          });
        }

        return actions;
      },
    };
  }, [queryClient, membersForProject, categoriesForProject, projects, user, categoryNameById, searchIndex, tIssueUI, tStatus, tPriority, tField, tAction]);

  const entityProvider = useMemo(
    () =>
      createMinddyEntityActionsProvider({
        labels: {
          copied: tAction("copied"),
          linkCopied: tAction("linkCopied"),
          openInNewTab: tAction("openInNewTab"),
          copyLink: tAction("copyLink"),
          newIssue: tAction("newIssue"),
          newObjective: tAction("newObjective"),
          copyProjectKey: tAction("copyProjectKey"),
          openObjectives: tAction("openObjectives"),
          openPages: tAction("openPages"),
          openTriage: tAction("openTriage"),
          openFeedback: tAction("openFeedback"),
          openProjectSettings: tAction("openProjectSettings"),
          viewObjectiveIssues: tAction("viewObjectiveIssues"),
          newIssueForObjective: tAction("newIssueForObjective"),
          copyObjectiveName: tAction("copyObjectiveName"),
          openProjectBoard: tAction("openProjectBoard"),
          newIssueInProject: tAction("newIssueInProject"),
          copyPageTitle: tAction("copyPageTitle"),
          copyIssueTitle: tAction("copyIssueTitle"),
          openLinkedObjective: tAction("openLinkedObjective"),
        },
        navigate: (href) => router.push(href),
        openInNewTab: (href) => { void appTabs?.create(href); },
        copyText: async (value, confirmation, resolveHref) => {
          const text = resolveHref
            ? new URL(value, window.location.origin).href
            : value;
          await navigator.clipboard.writeText(text);
          toast.success(confirmation);
        },
        openCreateIssue: (projectId, objectiveId) =>
          openCreateIssue({ projectId, objectiveId }),
        openCreateObjective: (projectId) => openCreateObjective({ projectId }),
      }),
    [appTabs, openCreateIssue, openCreateObjective, router, tAction]
  );

  // === “Change the theme”: a single item, the inline select makes the submenu ===
  const themeProvider = useMemo<ActionProvider>(() => {
    const THEME_OPTIONS: { value: string; label: string; icon: typeof Sun01Icon }[] = [
      { value: "light", label: tNav("themeLight"), icon: Sun01Icon },
      { value: "dark", label: tNav("themeDark"), icon: MoonIcon },
      { value: "system", label: tNav("themeSystem"), icon: ComputerIcon },
    ];

    return {
      id: "theme",
      handles: ["theme"],
      priority: 50,
      getActions: (): ContextualAction[] => [
        {
          id: "theme.change",
          label: themeLabel,
          icon: Sun01Icon,
          category: "primary",
          // Enter already opens the select: not a reason for a submenu
          basic: true,
          requiresForm: {
            fields: [
              {
                key: "theme",
                type: "select",
                label: themeLabel,
                options: THEME_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  icon: <HugeiconsIcon icon={o.icon} className="size-4" />,
                  selected: o.value === theme,
                })),
              },
            ],
            onSubmit: async (values): Promise<ActionResult> => {
              setTheme(values.theme as "light" | "dark" | "system");
              return { success: true, closeMenu: false };
            },
          },
        },
      ],
    };
  }, [theme, setTheme, tNav, themeLabel]);

  // === Group selection (MIN-75): options like normal palette lines ===
  // In bulk mode, `bulkItems` REPLACES the usual list. Number and Delete
  // execute directly (`execute`); the configurable fields carry
  // entityType "bulk-field" and do not have `execute` → selecting them opens the
  // inline form (the “submenu”, like “Change theme”), served by
  // `bulkFieldProvider`.
  const bulkItems = useMemo<CpPaletteItem[]>(() => {
    if (!bulkRequest) return [];
    // A feedback, routine, objective or page selection (MIN-873): the surface
    // describes every row; one with choices opens the inline select below.
    if (bulkRequest.kind === "entities") {
      const askNumo: CpPaletteItem = {
        id: "bulk-ask-numo",
        title: tBulk("askNumo"),
        icon: <NumoActionIcon className="size-4" />,
        keywords: ["numo", "agent", "ai", "demander"],
        filterCategory: "bulk",
        execute: () => bulkRequest.onAskNumo(),
      };
      return [
        askNumo,
        ...bulkRequest.actions.map((action): CpPaletteItem => ({
          id: `bulk-${action.id}`,
          title: action.title,
          icon: isValidElement(action.icon)
            ? action.icon
            : <HugeiconsIcon icon={action.icon as IconSvgElement} className="size-4" />,
          keywords: action.keywords,
          filterCategory: "bulk",
          ...(action.choices
            ? { entityType: "bulk-field", data: { field: action.id } }
            : { execute: () => action.run?.() }),
        })),
      ];
    }
    const {
      count,
      onDelete,
      onAskNumo,
      onCopyPrompt,
      cycle,
      objectives,
      onLink,
      pullRequestLinks,
    } = bulkRequest;
    const field = (f: string): Partial<CpPaletteItem> => ({
      filterCategory: "bulk",
      entityType: "bulk-field",
      data: { field: f },
    });

    const list: CpPaletteItem[] = [
      {
        id: "bulk-ask-numo",
        title: tBulk("askNumo"),
        icon: <NumoActionIcon className="size-4" />,
        keywords: ["numo", "agent", "ai", "demander"],
        filterCategory: "bulk",
        execute: () => {
          onAskNumo();
        },
      },
      // ⇧P on the selection (MIN-539): one combined prompt, copied as a whole.
      ...(onCopyPrompt
        ? [
            {
              id: "bulk-copy-prompt",
              title: tBulk("copyPrompt"),
              icon: <HugeiconsIcon icon={Copy01Icon} className="size-4" />,
              keywords: ["prompt", "copy", "copier", "agent", "code"],
              shortcut: ["⇧", "P"],
              filterCategory: "bulk",
              execute: () => {
                onCopyPrompt();
              },
            } as CpPaletteItem,
          ]
        : []),
      {
        id: "bulk-status",
        title: tIssueUI("changeStatusAria"),
        icon: <HugeiconsIcon icon={CircleIcon} className="size-4" />,
        keywords: ["statut", "status"],
        ...field("status"),
      } as CpPaletteItem,
      {
        id: "bulk-priority",
        title: tIssueUI("changePriorityAria"),
        icon: <HugeiconsIcon icon={SignalFull01Icon} className="size-4" />,
        keywords: ["priorité", "priority"],
        ...field("priority"),
      } as CpPaletteItem,
      {
        id: "bulk-effort",
        title: tIssueUI("changeEffortAria"),
        icon: <HugeiconsIcon icon={TriangleIcon} className="size-4" />,
        keywords: ["effort", "estimation"],
        ...field("effort"),
      } as CpPaletteItem,
      {
        id: "bulk-assignee",
        title: tIssueUI("changeAssigneeAria"),
        icon: <HugeiconsIcon icon={UserCircleIcon} className="size-4" />,
        keywords: ["assigné", "assignee", "responsable"],
        ...field("assignee"),
      } as CpPaletteItem,
    ];

    // The objective is specific to a project: the line only exists if the entire
    // selection fits in the same (the board removes it otherwise).
    if (objectives && objectives.length > 0) {
      list.push({
        id: "bulk-objective",
        title: tIssueUI("changeObjectiveAria"),
        icon: <HugeiconsIcon icon={Target01Icon} className="size-4" />,
        keywords: ["objectif", "objective", "goal"],
        ...field("objective"),
      } as CpPaletteItem);
    }

    // Cycle: the two directions coexist on a mixed selection — each does not
    // only touches the tickets it concerns.
    if (cycle && cycle.addable > 0) {
      list.push({
        id: "bulk-cycle-add",
        title: tCycles("addToCycle"),
        icon: <AppIcon icon={CycleIcon} className="size-4" />,
        keywords: ["cycle", "semaine", "week", "sprint", "ajouter"],
        filterCategory: "bulk",
        execute: () => {
          cycle.onAdd();
          toast.success(tCycles("bulkAdded", { count: cycle.addable }));
        },
      });
    }
    if (cycle && cycle.removable > 0) {
      list.push({
        id: "bulk-cycle-remove",
        title: tCycles("removeFromCycle"),
        icon: <AppIcon icon={CycleIcon} className="size-4" />,
        keywords: ["cycle", "semaine", "week", "sprint", "retirer"],
        filterCategory: "bulk",
        execute: () => {
          cycle.onRemove();
          toast.success(tCycles("bulkRemoved", { count: cycle.removable }));
        },
      });
    }

    // Link: a relationship has exactly two ends, so the line does not appear
    // only to two selected tickets (and from the same project — see the board).
    if (onLink) {
      list.push({
        id: "bulk-link",
        title: tBulk("link"),
        icon: <HugeiconsIcon icon={Link02Icon} className="size-4" />,
        keywords: ["lier", "link", "relation", "related", "liés"],
        filterCategory: "bulk",
        execute: () => {
          onLink();
          toast.success(tBulk("linked"));
        },
      });
    }

    // Pull requests (MIN-735 follow-up): pick one for the whole selection, or
    // extend a PR some selected tickets already have to the others.
    if (pullRequestLinks?.options.length) {
      list.push({
        id: "bulk-link-pr",
        title: tPr("linkToPullRequest"),
        icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
        keywords: ["pull request", "pr", "lier", "link", "merge request"],
        ...field("link-pr"),
      } as CpPaletteItem);
    }
    if (pullRequestLinks && pullRequestLinks.unlinkCount > 0) {
      list.push({
        id: "bulk-unlink-pr",
        title: tPr("unlinkFromPullRequests", { count: pullRequestLinks.unlinkCount }),
        icon: <HugeiconsIcon icon={Cancel01Icon} className="size-4" />,
        keywords: ["pull request", "pr", "délier", "unlink", "detach"],
        filterCategory: "bulk",
        execute: () => pullRequestLinks.onUnlinkAll(),
      });
    }
    for (const pr of pullRequestLinks?.partial ?? []) {
      list.push({
        id: `bulk-link-pr-${pr.prId}`,
        title: tPr("linkOthersToPullRequest", { number: pr.prNumber }),
        icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
        keywords: ["pull request", "pr", "lier", "link", `#${pr.prNumber}`],
        filterCategory: "bulk",
        execute: () => pullRequestLinks?.onLink(pr),
      });
    }

    if (onDelete) {
      list.push({
        id: "bulk-delete",
        title: tBulk("delete", { count }),
        icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
        keywords: ["supprimer", "delete", "remove"],
        filterCategory: "bulk",
        // Opens the selection's confirmation dialog; nothing is trashed yet.
        execute: () => onDelete(),
      });
    }

    return list;
  }, [bulkRequest, tBulk, tCycles, tIssueUI, tPr]);

  // A single group, titled with the number of tickets selected.
  const bulkCategories = useMemo<CategoryDefinition[]>(
    () =>
      bulkRequest
        ? [{
            id: "bulk",
            label: bulkRequest.kind === "entities"
              ? bulkRequest.label
              : tBulk("selected", { count: bulkRequest.count }),
          }]
        : [],
    [bulkRequest, tBulk]
  );

  // Inline form (the “submenu”) for configurable fields. Each
  // item "bulk-field" has a primary form action, without `execute`: the
  // select opens the inline select, whose validation applies the patch.
  const bulkFieldProvider = useMemo<ActionProvider>(() => {
    const selectField = (
      key: string,
      label: string,
      options: FormSelectOption[]
    ) => ({ fields: [{ key, type: "select" as const, label, options }] });

    return {
      id: "bulk-field-actions",
      handles: ["bulk-field"],
      priority: 60,
      getActions: (item): ContextualAction[] => {
        const req = bulkRequest;
        if (!req) return [];
        const fieldKey = (item.data as { field?: string } | undefined)?.field;
        if (!fieldKey) return [];

        if (req.kind === "entities") {
          const action = req.actions.find((candidate) => candidate.id === fieldKey);
          const choices = action?.choices;
          if (!action || !choices) return [];
          return [
            {
              id: `bulk.${action.id}`,
              label: action.title,
              // Choices are always Hugeicons rows: an element has no place here.
              icon: isValidElement(action.icon) ? CircleIcon : (action.icon as IconSvgElement),
              category: "primary",
              requiresForm: {
                ...selectField("value", action.title, choices.options),
                onSubmit: async (values): Promise<ActionResult> => {
                  const value = values.value as string;
                  const option = choices.options.find((candidate) => candidate.value === value);
                  if (!option) return { success: false, closeMenu: false };
                  choices.onPick(value);
                  const message = choices.appliedMessage(option.label, value);
                  if (message) toast.success(message);
                  return { success: true, closeMenu: false };
                },
              },
            },
          ];
        }

        // closeMenu:false → return to the bulk list, we can chain another field.
        const update = async (
          patch: Parameters<typeof req.onUpdate>[0],
          message: string
        ): Promise<ActionResult> => {
          req.onUpdate(patch);
          toast.success(message);
          return { success: true, closeMenu: false };
        };

        if (fieldKey === "status") {
          return [
            {
              id: "bulk.status",
              label: tIssueUI("changeStatusAria"),
              icon: CircleIcon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "status",
                  tIssueUI("changeStatusAria"),
                  statusOptions(tStatus)
                ),
                onSubmit: (values) =>
                  update(
                    { status: values.status as IssueStatus },
                    `${tIssueUI("changeStatusAria")} → ${tStatus(values.status as IssueStatus)}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "priority") {
          return [
            {
              id: "bulk.priority",
              label: tIssueUI("changePriorityAria"),
              icon: SignalFull01Icon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "priority",
                  tIssueUI("changePriorityAria"),
                  priorityOptions(tPriority)
                ),
                onSubmit: (values) =>
                  update(
                    { priority: values.priority as IssuePriority },
                    `${tIssueUI("changePriorityAria")} → ${tPriority(values.priority as IssuePriority)}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "effort") {
          return [
            {
              id: "bulk.effort",
              label: tIssueUI("changeEffortAria"),
              icon: TriangleIcon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "effort",
                  tIssueUI("changeEffortAria"),
                  effortOptions(tField("effortNone"))
                ),
                onSubmit: (values) =>
                  update(
                    { effort: effortFromPalette(values.effort) },
                    `${tIssueUI("changeEffortAria")} → ${effortPaletteLabel(values.effort, tField("effortNone"))}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "link-pr" && req.pullRequestLinks) {
          const links = req.pullRequestLinks;
          return [
            {
              id: "bulk.link-pr",
              label: tPr("linkToPullRequest"),
              icon: GitPullRequestIcon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "pullRequest",
                  tPr("linkToPullRequest"),
                  links.options.map((pr) => ({
                    value: pr.prId,
                    label: `#${pr.prNumber} ${pr.title}`,
                  }))
                ),
                onSubmit: async (values): Promise<ActionResult> => {
                  const pr = links.options.find((option) => option.prId === values.pullRequest);
                  if (pr) links.onLink(pr);
                  return { success: true, closeMenu: true };
                },
              },
            },
          ];
        }
        if (fieldKey === "objective") {
          return [
            {
              id: "bulk.objective",
              label: tIssueUI("changeObjectiveAria"),
              icon: Target01Icon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "objective",
                  tIssueUI("changeObjectiveAria"),
                  // Picker order (MIN-785): the selection is single-project here.
                  objectiveOptions(
                    orderObjectives(
                      req.objectives ?? [],
                      queryClient.getQueryData<Issue[]>(["issues", req.objectives?.[0]?.project_id]) ?? []
                    ),
                    tField("noObjective")
                  )
                ),
                onSubmit: (values) =>
                  update(
                    {
                      objective_id:
                        values.objective === PALETTE_NONE
                          ? null
                          : (values.objective as string),
                    },
                    tIssueUI("changeObjectiveAria")
                  ),
              },
            },
          ];
        }
        if (fieldKey === "assignee") {
          return [
            {
              id: "bulk.assignee",
              label: tIssueUI("changeAssigneeAria"),
              icon: UserCircleIcon,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "assignee",
                  tIssueUI("changeAssigneeAria"),
                  assigneeOptions(req.members, {
                    label: tField(req.smartAssign ? "smartAssign" : "unassigned"),
                    smartAssign: req.smartAssign,
                  })
                ),
                onSubmit: (values) =>
                  update(
                    {
                      assignee_id:
                        values.assignee === PALETTE_NONE
                          ? null
                          : (values.assignee as string),
                    },
                    tIssueUI("changeAssigneeAria")
                  ),
              },
            },
          ];
        }
        return [];
      },
    };
  }, [bulkRequest, queryClient, tIssueUI, tStatus, tPriority, tField, tPr]);

  const providers = useMemo(
    () => [issueProvider, entityProvider, themeProvider, bulkFieldProvider],
    [issueProvider, entityProvider, themeProvider, bulkFieldProvider]
  );

  // Issues found by meaning (MIN-718): the palette's own issue rows, looked up
  // by id, appended after the scored results under their own heading. Only
  // rows the palette already holds can appear, so nothing outside the
  // search index (and its access rules) does. Not in bulk mode, nor in the
  // new-tab destination launcher.
  const tPicker = useTranslations("Picker");
  // A picker searches by meaning among its own issue rows, when it asks to.
  const semanticEnabled = open && (picker
    ? picker.semanticProjectId !== undefined
    : !showBulk && !destinationOnly);
  const semanticSource = picker ? picker.items : searchItems;
  // Subscribed only while it can be used; the categories and supplemental
  // results below are memoized, so a keystroke re-renders this host without
  // handing the palette new props (which would rescore every item). A
  // picker's creation row is titled with the query, so it subscribes too.
  const paletteQuery = usePaletteStore((state) => (semanticEnabled || picker?.create ? state.query : ""));
  const { ids: semanticIds, pending: semanticPending, answered: semanticAnswered } = useSemanticIssueSearch(
    semanticEnabled ? paletteQuery : "",
    { projectId: picker?.semanticProjectId ?? null, enabled: semanticEnabled },
  );
  const semanticItems = useMemo(() => {
    if (!semanticEnabled || semanticIds.length === 0) return [];
    const issueRows = new Map(
      semanticSource.filter((item) => item.entityType === "issue").map((item) => [item.id, item])
    );
    return semanticExtras(
      semanticIds.map((id) => `issue-${id}`),
      issueRows,
      new Set<string>(),
    ).map((item) => ({ ...item, filterCategory: SEMANTIC_CATEGORY }))
      // Same order as the text rows, by similarity within a tier (MIN-726).
      .sort((a, b) => (a.searchTier ?? 1) - (b.searchTier ?? 1));
  }, [semanticEnabled, semanticIds, semanticSource]);

  // The picker's creation row (a new page titled with the query): a plain row
  // while nothing is typed, then appended after the matches, which it never
  // has to compete with.
  const pickerCreate = picker?.create;
  const pickerCreateQuery = pickerCreate ? paletteQuery.trim() : "";
  const pickerCreateItem = useMemo<CpPaletteItem | null>(() => {
    if (!pickerCreate) return null;
    return {
      id: pickerCreate.id,
      title: pickerCreate.label(pickerCreateQuery),
      icon: pickerCreate.icon,
      filterCategory: pickerCreate.category,
      execute: () => pickerCreate.onCreate(pickerCreateQuery),
    };
  }, [pickerCreate, pickerCreateQuery]);

  // In bulk mode, the palette displays the selection options instead of the
  // normal content (navigation, creation, etc.).
  const pickerItems = useMemo(
    () => picker
      ? [...picker.items, ...(pickerCreateItem && !pickerCreateQuery ? [pickerCreateItem] : [])]
      : null,
    [picker, pickerCreateItem, pickerCreateQuery],
  );
  const paletteItems = pickerItems ?? (showBulk ? bulkItems : searchItems);
  const semanticLabel = tPicker("relatedByMeaning");
  const hasSemanticItems = semanticItems.length > 0;
  const paletteCategories = useMemo(() => {
    const semanticCategory = { id: SEMANTIC_CATEGORY, label: semanticLabel };
    if (picker) return [...picker.categories, semanticCategory];
    if (showBulk) return bulkCategories;
    if (navigationSearch) {
      return [
        ...categories.filter((category) => searchItems.some((item) => item.filterCategory === category.id)),
        ...(hasSemanticItems ? [semanticCategory] : []),
      ];
    }
    return [...categories, semanticCategory];
  }, [picker, showBulk, bulkCategories, navigationSearch, categories, searchItems, hasSemanticItems, semanticLabel]);
  const supplemental = useMemo(
    () => picker ? {
      items: [...semanticItems, ...(pickerCreateItem && pickerCreateQuery ? [pickerCreateItem] : [])],
      status: semanticPending
        ? <SemanticSearchingHint />
        : picker.status ?? (semanticAnswered && semanticItems.length === 0 && !pickerCreateItem
          ? <SemanticSearchingHint status="none" />
          : undefined),
    } : showBulk ? undefined : {
      items: semanticItems,
      categories: ["issues"],
      status: semanticPending
        ? <SemanticSearchingHint />
        : semanticAnswered && semanticItems.length === 0
          ? <SemanticSearchingHint status="none" />
          : undefined,
    },
    [picker, pickerCreateItem, pickerCreateQuery, showBulk, semanticItems, semanticPending, semanticAnswered],
  );

  // The placeholder follows the mode: the new-tab launcher asks for a
  // destination, bulk mode names the selection it acts on, and the usual
  // generic line applies otherwise (host override of the shell's own string).
  const pickerPlaceholder = picker?.placeholder;
  const paletteStrings = useMemo<PaletteStrings | undefined>(() => {
    if (pickerPlaceholder) return { "search.placeholder": pickerPlaceholder };
    if (mobile && !showBulk) {
      return { "search.placeholder": tNav("searchPlaceholder") };
    }
    if (showBulk && bulkRequest) {
      return {
        "search.placeholder": bulkRequest.kind === "entities"
          ? bulkRequest.placeholder
          : tAction("bulkSearchPlaceholder", { count: bulkRequest.count }),
      };
    }
    if (destinationOnly) {
      return { "search.placeholder": tAction("newTabSearchPlaceholder") };
    }
    return undefined;
  }, [pickerPlaceholder, showBulk, bulkRequest, destinationOnly, mobile, tNav, tAction]);

  return (
    <CommandPaletteShell
      isOpen={open}
      onClose={() => onOpenChange(false)}
      items={paletteItems}
      supplemental={supplemental}
      categories={paletteCategories}
      providers={picker || (navigationSearch && !showBulk) ? [] : providers}
      locale={locale}
      strings={paletteStrings}
      // The page project is a BOOST of relevance, not a filter: its
      // tickets and objectives go up, those of other projects remain there.
      actionContext={currentProjectId ? { contextId: currentProjectId } : undefined}
      // A picker keeps its own usage ranks and no query history: what was
      // linked before says nothing about the next link.
      storagePrefix={picker ? "minddy-cp-picker" : destinationOnly ? "minddy-cp-destinations" : "minddy-cp"}
      history={!picker}
      actionsShortcutKey=";"
      onToast={(message, type) => {
        if (type === "error") toast.error(message);
        else if (type === "success") toast.success(message);
        else toast(message);
      }}
      onHoverPrefetch={handleHoverPrefetch}
      quickAi={navigationSearch || picker ? undefined : {
        icon: <NumoActionIcon className="size-4" />,
        onSelect: (query) => {
          // Filled query → auto-sent to Numo; empty query → the panel just
          // opens, like a click on the FAB. Either way the palette closes.
          const prompt = query.trim();
          if (prompt) assistant.open({ prompt });
          else assistant.open();
          onOpenChange(false);
        },
      }}
    />
  );
}
