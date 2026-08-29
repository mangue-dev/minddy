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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { useAccountTheme } from "@/lib/use-account-theme";
import {
  Bookmark,
  BookmarkPlus,
  CircleDashed,
  ClipboardCopy,
  Copy,
  IterationCw,
  Link2,
  Monitor,
  Moon,
  Pencil,
  SignalHigh,
  Sun,
  SunMoon,
  Target,
  Trash2,
  Triangle,
  UserRound,
} from "lucide-react";
import {
  CommandPalette as CommandPaletteShell,
  type ActionProvider,
  type ActionResult,
  type CategoryDefinition,
  type ContextualAction,
  type FormSelectOption,
  type PaletteItem as CpPaletteItem,
} from "@/lib/command-palette";
import { NumoIcon } from "@/components/numo-icon";
import { StatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { useBulkActions } from "@/lib/bulk-actions-context";
import { displayName } from "@/lib/display-name";
import { fetchIssueApi, updateIssueApi } from "@/lib/issues-api";
import { buildIssuePrompt } from "@/lib/issue-prompt";
import {
  issueWrites,
  mergeServerIssue,
} from "@/lib/optimistic/issue-writes";
import { patchSearchIndexIssue } from "@/lib/use-search-index";
import { handOffIssueApi } from "@/lib/agent-api";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useCreate } from "@/lib/create-context";
import { useCurrentView } from "@/lib/current-view-context";
import { useSavedViewsQuery } from "@/lib/use-saved-views-query";
import { useProjects } from "@/lib/projects-context";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import {
  resolvePaletteFavorites,
  togglePaletteFavorite,
  PALETTE_FAVORITES_META_KEY,
} from "@/lib/palette-favorites";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { useMembersQuery } from "@/lib/use-members-query";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { useAnalytics } from "@/lib/use-analytics";
import { moveIssueGroupsToEnd } from "@/lib/command-palette/group-order";
import { createMinddyEntityActionsProvider } from "@/lib/command-palette/registry/providers/MinddyEntityActionsProvider";
import type {
  Issue,
  Member,
  SavedView,
  SearchIndexIssue,
  SearchIndexResponse,
} from "@/lib/types";
import type { PaletteGroup } from "@/components/header-search-pill";
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
  // Saved views come before everything: they are the only lines that
  // the user has made it himself to come back to it quickly. The boost follows the
  // position of the group (see `categories`), so that a search does not
  // does not return where the display no longer puts them.
  views: 320,
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

/** Only board rows have `category_ids` (added by mapIssueRow) —
 * this is what distinguishes a complete ticket from an index line, devoid of
 * description and plan. */
function isFullIssue(issue: PaletteIssue): issue is Issue {
  return "category_ids" in issue;
}

/** Numo's face as a static action icon (no blinking in the popover). */
const NumoActionIcon = (props: SVGProps<SVGSVGElement>) => (
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
}

export function CommandPalette({
  groups,
  open,
  onOpenChange,
  searchIndex,
}: CommandPaletteProps) {
  const { track } = useAnalytics();
  const locale = useLocale();
  const tIssueUI = useTranslations("IssueUI");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tBulk = useTranslations("BulkActions");
  const tCycles = useTranslations("Cycles");
  const tNav = useTranslations("Nav");
  const tAction = useTranslations("CommandPaletteActions");
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, updateUserMetadata } = useAuth();
  const { projects } = useProjects();
  const { openCreateIssue, openCreateObjective } = useCreate();
  // The account theme: the choice is persisted to user_metadata so it
  // follows the account to every device (lib/use-account-theme.ts).
  const { theme, setTheme } = useAccountTheme();

  // Saved views: the current screen, retained under a name, re-openable from
  // any device. The list only loads when you open the
  // palette — closed, it renders nothing, and it is the only place that reads it.
  const { savedViews, createSavedView, renameSavedView, deleteSavedView } =
    useSavedViewsQuery(open);
  const currentView = useCurrentView();

  // Group selection (MIN-75): a board publishes its selection via context.
  // The “Actions” pill opens ⌘K in BULK MODE — the palette then displays the
  // selection options (Number, change status/priority/effort/assigned,
  // delete) like normal lines, instead of the usual content. THE
  // configurable fields open the inline form (the “submenu”, like
  // “Change the theme”).
  const { request: bulkRequest, openSignal } = useBulkActions();
  const [bulkMode, setBulkMode] = useState(false);

  // Favorites persisted in the account (user_metadata.palette_favorites) — same
  // mechanism as the account preferences, so they survive reloads and sync
  // across devices (vs the package's device-local localStorage default). Local
  // state mirrors the metadata and updates optimistically, reverting on failure.
  const serverFavorites = resolvePaletteFavorites(user?.user_metadata);
  const [favorites, setFavorites] = useState<string[]>(serverFavorites);
  const favoritesRef = useRef(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);
  // Re-sync when the account metadata changes (another tab/device, or after a
  // write settles). Keyed on the serialized value to avoid an identity-churn loop.
  const serverFavoritesKey = serverFavorites.join(" ");
  useEffect(() => {
    setFavorites(serverFavorites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverFavoritesKey]);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      const prev = favoritesRef.current;
      const next = togglePaletteFavorite(prev, id);
      setFavorites(next);
      favoritesRef.current = next;
      updateUserMetadata({ [PALETTE_FAVORITES_META_KEY]: next }).catch(() => {
        setFavorites(prev);
        favoritesRef.current = prev;
      });
    },
    [updateUserMetadata]
  );

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

  // Members of the DU TICKET project — the palette now lists tickets for
  // all projects, so the assignee can no longer come from the URL project.
  const membersForProject = useCallback(
    (projectId: string): Member[] => {
      if (projectId === currentProjectId && members.length > 0) return members;
      return searchIndex?.members[projectId] ?? [];
    },
    [currentProjectId, members, searchIndex]
  );

  // A board pill has requested grouped actions → we open the palette by
  // bulk mode (it will then display the selection options).
  useEffect(() => {
    if (openSignal === 0) return;
    onOpenChange(true);
    setBulkMode(true);
  }, [openSignal, onOpenChange]);

  // Any closure (Escape, click outside, ⌘K) exits bulk mode: the next
  // opening ⌘K/⌘P finds the normal palette.
  useEffect(() => {
    if (!open) setBulkMode(false);
  }, [open]);

  // The cmdk groups become the categories of the palette (order preserved),
  // plus “Saved views”, which ONLY exists in the palette: neither the nav
  // mobile nor the sidebar serve these lines.
  //
  // It goes AT THE HEAD, and it is the position that counts: with an empty request, the
  // list follows the order of the categories (`buildCategoryOrder`), not the
  // `searchBoost` — these only categorize a current search. In tail,
  // saved views were found under tickets and pages, so
  // under thousands of lines: the exact opposite of the rapid access that we have
  // made yourself. Tickets are the one exception: they always come after every
  // command, navigation target, setting, objective, and page so a large ticket
  // index cannot bury a more specific result.
  const categories = useMemo<CategoryDefinition[]>(
    () => [
      {
        id: "views",
        label: tNav("savedViews"),
        searchBoost: GROUP_BOOSTS.views,
      },
      ...moveIssueGroupsToEnd(groups).map((g, i) => {
        const id = g.key ?? g.heading ?? `group-${i}`;
        return {
          id,
          label: g.heading ?? id,
          searchBoost: GROUP_BOOSTS[id] ?? 0,
        };
      }),
    ],
    [groups, tNav]
  );

  const themeLabel = tNav("changeTheme");

  // Each cmdk PaletteItem becomes an item in the palette. metaText (id
  // PQ-42, project name) becomes the contextLabel dim; tickets receive
  // the (colored) icon of their status. The 3 flat theme options are
  // replaced by a single “Change theme” (select submenu) and
  // “Log out” is removed.
  const items = useMemo<CpPaletteItem[]>(() => {
    const HIDDEN_KEYS = new Set(["cmd-light", "cmd-dark", "cmd-system", "cmd-signout"]);

    const mapped = groups.flatMap((g, gi) => {
      const cat = g.key ?? g.heading ?? `group-${gi}`;
      return g.items
        .filter((it) => !HIDDEN_KEYS.has(it.key))
        .map((it): CpPaletteItem => {
          const Icon = it.icon;
          const issue = it.entityType === "issue" ? (it.data as PaletteIssue) : null;
          return {
            id: it.key,
            title: it.label,
            keywords: it.keywords,
            description: it.description,
            icon: issue
              ? statusIcon(issue.status)
              : Icon
                ? <Icon className="size-4" />
                : undefined,
            contextLabel: it.metaText,
            filterCategory: cat,
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
              it.onSelect?.();
            },
          };
        });
    });

    // “Change theme”: Enter/⌘; opens the select inline (provider "theme")
    mapped.push({
      id: "cmd-theme",
      title: themeLabel,
      keywords: ["theme", "thème", "apparence", "appearance", "dark", "light", "sombre", "clair"],
      icon: <SunMoon className="size-4" />,
      filterCategory: "account",
      entityType: "theme",
    });

    // Saved views, FIRST in their group — that's what we come from
    // search there. Enter opens the selected address; ⌘; gives rename and forget.
    // (Display sorting only classifies the categories among themselves: in a
    // group, the order of the table is the order on the screen.)
    for (const view of savedViews) {
      mapped.push({
        id: `saved-view-${view.id}`,
        title: view.name,
        icon: <Bookmark className="size-4" />,
        filterCategory: "views",
        entityType: "saved-view",
        // No stars: a saved view IS already a shortcut that we have
        // made. Bookmarking it would pin a bookmark to a bookmark — and
        // would leave its id in the account once the view is forgotten.
        favoritable: false,
        data: view,
        href: view.href,
        execute: () => {
          track("saved_view_opened", {});
          router.push(view.href);
        },
      });
    }

    // “Save current view” closes the group: we use it once
    // per view, when we reopen the views every day. No `execute` → the
    // select opens the inline name field (provider "saved-view-actions"),
    // like the grouped mode fields. The screen is only read upon validation.
    mapped.push({
      id: "cmd-save-view",
      title: tNav("saveCurrentView"),
      keywords: [
        "vue",
        "view",
        "enregistrer",
        "sauvegarder",
        "save",
        "bookmark",
        "favori",
        "signet",
        "raccourci",
        "shortcut",
      ],
      icon: <BookmarkPlus className="size-4" />,
      filterCategory: "views",
      entityType: "save-view",
      favoritable: false,
    });

    return mapped;
  }, [groups, themeLabel, track, savedViews, router, tNav]);

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
              ALL_STATUSES.map((s) => ({
                value: s.value,
                label: tStatus(s.value),
                icon: <StatusIndicator status={s.value} className="size-4" />,
                description: s.value === issue.status ? "•" : undefined,
              }))
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
              PRIORITIES.map((p) => ({
                value: p.value,
                label: tPriority(p.value),
                icon: <PriorityIndicator priority={p.value} className="size-4" />,
                description: p.value === issue.priority ? "•" : undefined,
              }))
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
        // letter). The full indicator would not fit in this 16 px slot,
        // and the options do not carry any on the cards either — the letter
        // (XS…XL) IS the information.
        actions.push({
          id: "issue.effort",
          label: tIssueUI("changeEffortAria"),
          icon: Triangle,
          category: "secondary",
          priority: 20,
          requiresForm: {
            ...selectField(
              "effort",
              tIssueUI("changeEffortAria"),
              EFFORTS.map((e) => ({
                value: e.value,
                label: e.label,
                description: e.value === issue.effort ? "•" : undefined,
              }))
            ),
            onSubmit: (values) =>
              update(
                issue,
                { effort: values.effort as IssueEffort },
                `${tIssueUI("changeEffortAria")} → ${String(values.effort).toUpperCase()}`
              ),
          },
        });

        // — Assigned —
        actions.push({
          id: "issue.assignee",
          label: tIssueUI("changeAssigneeAria"),
          icon: UserRound,
          category: "secondary",
          priority: 10,
          requiresForm: {
            ...selectField("assignee", tIssueUI("changeAssigneeAria"), [
              { value: "__none__", label: tField("unassigned") },
              ...membersForProject(issue.project_id).map((m) => ({
                value: m.user_id,
                label: displayName(m),
                description: m.user_id === issue.assignee_id ? "•" : undefined,
              })),
            ]),
            onSubmit: (values) =>
              update(
                issue,
                {
                  assignee_id:
                    values.assignee === "__none__"
                      ? null
                      : (values.assignee as string),
                },
                tIssueUI("changeAssigneeAria")
              ),
          },
        });

        const projectObjectives = (searchIndex?.objectives ?? []).filter(
          (objective) => objective.project_id === issue.project_id
        );
        actions.push({
          id: "issue.objective",
          label: tIssueUI("changeObjectiveAria"),
          icon: Target,
          category: "secondary",
          priority: 9,
          requiresForm: {
            ...selectField("objective", tIssueUI("changeObjectiveAria"), [
              {
                value: "__none__",
                label: tField("noObjective"),
                description: issue.objective_id === null ? "•" : undefined,
              },
              ...projectObjectives.map((objective) => ({
                value: objective.id,
                label: objective.name,
                description: objective.id === issue.objective_id ? "•" : undefined,
              })),
            ]),
            onSubmit: (values) =>
              update(
                issue,
                {
                  objective_id:
                    values.objective === "__none__"
                      ? null
                      : (values.objective as string),
                },
                tIssueUI("changeObjectiveAria")
              ),
          },
        });

        // — Copy the prompt (the ⇧P of the board: XML agent + auto-start MIN-20) —
        actions.push({
          id: "issue.copy-prompt",
          label: tIssueUI("copyAsPrompt"),
          icon: ClipboardCopy,
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
            });
            await navigator.clipboard.writeText(prompt);
            // Copying a prompt means taking the ticket in hand: the chain that
            // waiting for him on reprieve is canceled (MIN-147). Here as in the menu
            // of the board — and even when the auto-start is off, in which case the
            // ticket is not moving and nothing else would signal it.
            handOffIssueApi(full.id);
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
            icon: Copy,
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
  }, [queryClient, membersForProject, projects, user, categoryNameById, searchIndex, tIssueUI, tStatus, tPriority, tField, tAction]);

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
        openInNewTab: (href) => {
          window.open(
            new URL(href, window.location.origin).href,
            "_blank",
            "noopener,noreferrer"
          );
        },
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
    [openCreateIssue, openCreateObjective, router, tAction]
  );

  // === “Change the theme”: a single item, the inline select makes the submenu ===
  const themeProvider = useMemo<ActionProvider>(() => {
    const THEME_OPTIONS: { value: string; label: string; icon: typeof Sun }[] = [
      { value: "light", label: tNav("themeLight"), icon: Sun },
      { value: "dark", label: tNav("themeDark"), icon: Moon },
      { value: "system", label: tNav("themeSystem"), icon: Monitor },
    ];

    return {
      id: "theme",
      handles: ["theme"],
      priority: 50,
      getActions: (): ContextualAction[] => [
        {
          id: "theme.change",
          label: themeLabel,
          icon: SunMoon,
          category: "primary",
          requiresForm: {
            fields: [
              {
                key: "theme",
                type: "select",
                label: themeLabel,
                options: THEME_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  icon: <o.icon className="size-4" />,
                  description: o.value === theme ? "•" : undefined,
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

  // === Saved views: save, rename, forget ===
  // A single provider for the two lines of the group, because they are the
  // two sides of the same gesture: “Save current view” asks for a name,
  // a saved view is renamed or forgotten.
  const savedViewProvider = useMemo<ActionProvider>(() => {
    // The inline form displays “<action label>: <field>”. TEA
    // wording of the FIELD serves as replacement text (it overrides
    // `placeholder`), so we put the example there — “Save the current view:
    // View name” said the same thing twice, and the question asked
    // was nowhere.
    const nameField = (initial?: string) => ({
      fields: [
        {
          key: "name",
          type: "text" as const,
          label: tNav("saveViewNamePlaceholder"),
        },
      ],
      ...(initial ? { prefilledValues: { name: initial } } : {}),
    });

    return {
      id: "saved-view-actions",
      handles: ["save-view", "saved-view"],
      priority: 60,
      getActions: (item): ContextualAction[] => {
        if (item.entityType === "save-view") {
          return [
            {
              id: "saved-view.create",
              // Not “Save current view”: that’s the name of the
              // LINE that we have just chosen. Once inside, the screen does not
              // doesn't repeat the gesture, he asks the remaining question.
              label: tNav("nameThisView"),
              icon: BookmarkPlus,
              category: "primary",
              requiresForm: {
                // `getActions` is executed when the menu is opened: the proposed name
                // is that of the screen AT THIS MOMENT, not that of a rendering
                // previous.
                ...nameField(currentView.resolveLabel() ?? undefined),
                onSubmit: async (values): Promise<ActionResult> => {
                  // The address is resolved NOW, in the manager: the
                  // page may have changed selection since opening ⌘K.
                  const href = currentView.resolveHref();
                  try {
                    const view = await createSavedView({
                      name: String(values.name ?? ""),
                      href,
                    });
                    toast.success(tNav("viewSaved", { name: view.name }));
                  } catch (err) {
                    toast.error((err as Error).message);
                    return { success: false, closeMenu: false };
                  }
                  return { success: true, closeMenu: true };
                },
              },
            },
          ];
        }

        const view = item.data as SavedView | undefined;
        if (!view) return [];

        return [
          {
            id: "saved-view.rename",
            label: tNav("renameSavedView"),
            icon: Pencil,
            category: "secondary",
            priority: 10,
            requiresForm: {
              ...nameField(view.name),
              onSubmit: async (values): Promise<ActionResult> => {
                try {
                  const next = await renameSavedView(
                    view.id,
                    String(values.name ?? "")
                  );
                  toast.success(tNav("savedViewRenamed", { name: next.name }));
                } catch (err) {
                  toast.error((err as Error).message);
                  return { success: false, closeMenu: false };
                }
                // closeMenu:false → return to the list, the line bears the
                // nouveau nom.
                return { success: true, closeMenu: false };
              },
            },
          },
          {
            id: "saved-view.delete",
            label: tNav("deleteSavedView"),
            icon: Trash2,
            category: "danger",
            priority: 0,
            execute: async (): Promise<ActionResult> => {
              try {
                await deleteSavedView(view.id);
                track("saved_view_deleted", {});
                toast.success(tNav("savedViewDeleted", { name: view.name }));
              } catch (err) {
                toast.error((err as Error).message);
                return { success: false, closeMenu: false };
              }
              return { success: true, closeMenu: false };
            },
          },
        ];
      },
    };
  }, [currentView, createSavedView, renameSavedView, deleteSavedView, track, tNav]);

  // === Group selection (MIN-75): options like normal palette lines ===
  // In bulk mode, `bulkItems` REPLACES the usual list. Number and Delete
  // execute directly (`execute`); the configurable fields carry
  // entityType "bulk-field" and do not have `execute` → selecting them opens the
  // inline form (the “submenu”, like “Change theme”), served by
  // `bulkFieldProvider`.
  const bulkItems = useMemo<CpPaletteItem[]>(() => {
    if (!bulkRequest) return [];
    const { count, onDelete, onAskNumo, cycle, objectives, onLink } =
      bulkRequest;
    const field = (f: string): Partial<CpPaletteItem> => ({
      filterCategory: "bulk",
      entityType: "bulk-field",
      favoritable: false,
      data: { field: f },
    });

    const list: CpPaletteItem[] = [
      {
        id: "bulk-ask-numo",
        title: tBulk("askNumo"),
        icon: <NumoActionIcon className="size-4" />,
        keywords: ["numo", "agent", "ai", "demander"],
        filterCategory: "bulk",
        favoritable: false,
        execute: () => {
          onAskNumo();
        },
      },
      {
        id: "bulk-status",
        title: tIssueUI("changeStatusAria"),
        icon: <CircleDashed className="size-4" />,
        keywords: ["statut", "status"],
        ...field("status"),
      } as CpPaletteItem,
      {
        id: "bulk-priority",
        title: tIssueUI("changePriorityAria"),
        icon: <SignalHigh className="size-4" />,
        keywords: ["priorité", "priority"],
        ...field("priority"),
      } as CpPaletteItem,
      {
        id: "bulk-effort",
        title: tIssueUI("changeEffortAria"),
        icon: <Triangle className="size-4" />,
        keywords: ["effort", "estimation"],
        ...field("effort"),
      } as CpPaletteItem,
      {
        id: "bulk-assignee",
        title: tIssueUI("changeAssigneeAria"),
        icon: <UserRound className="size-4" />,
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
        icon: <Target className="size-4" />,
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
        icon: <IterationCw className="size-4" />,
        keywords: ["cycle", "semaine", "week", "sprint", "ajouter"],
        filterCategory: "bulk",
        favoritable: false,
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
        icon: <IterationCw className="size-4" />,
        keywords: ["cycle", "semaine", "week", "sprint", "retirer"],
        filterCategory: "bulk",
        favoritable: false,
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
        icon: <Link2 className="size-4" />,
        keywords: ["lier", "link", "relation", "related", "liés"],
        filterCategory: "bulk",
        favoritable: false,
        execute: () => {
          onLink();
          toast.success(tBulk("linked"));
        },
      });
    }

    if (onDelete) {
      list.push({
        id: "bulk-delete",
        title: tBulk("delete", { count }),
        icon: <Trash2 className="size-4" />,
        keywords: ["supprimer", "delete", "remove"],
        filterCategory: "bulk",
        favoritable: false,
        execute: () => {
          if (
            typeof window !== "undefined" &&
            window.confirm(tBulk("deleteConfirm", { count }))
          ) {
            onDelete();
          } else {
            // Cancellation: keep the pallet open on the bulk list.
            return false;
          }
        },
      });
    }

    return list;
  }, [bulkRequest, tBulk, tCycles, tIssueUI]);

  // A single group, titled with the number of tickets selected.
  const bulkCategories = useMemo<CategoryDefinition[]>(
    () =>
      bulkRequest
        ? [{ id: "bulk", label: tBulk("selected", { count: bulkRequest.count }) }]
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
              icon: CircleDashed,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "status",
                  tIssueUI("changeStatusAria"),
                  ALL_STATUSES.map((s) => ({
                    value: s.value,
                    label: tStatus(s.value),
                    icon: <StatusIndicator status={s.value} className="size-4" />,
                  }))
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
              icon: SignalHigh,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "priority",
                  tIssueUI("changePriorityAria"),
                  PRIORITIES.map((p) => ({
                    value: p.value,
                    label: tPriority(p.value),
                    icon: <PriorityIndicator priority={p.value} className="size-4" />,
                  }))
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
              icon: Triangle,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "effort",
                  tIssueUI("changeEffortAria"),
                  EFFORTS.map((e) => ({ value: e.value, label: e.label }))
                ),
                onSubmit: (values) =>
                  update(
                    { effort: values.effort as IssueEffort },
                    `${tIssueUI("changeEffortAria")} → ${String(values.effort).toUpperCase()}`
                  ),
              },
            },
          ];
        }
        if (fieldKey === "objective") {
          return [
            {
              id: "bulk.objective",
              label: tIssueUI("changeObjectiveAria"),
              icon: Target,
              category: "primary",
              requiresForm: {
                ...selectField(
                  "objective",
                  tIssueUI("changeObjectiveAria"),
                  [
                    { value: "__none__", label: tField("noObjective") },
                    ...(req.objectives ?? []).map((o) => ({
                      value: o.id,
                      label: o.name,
                    })),
                  ]
                ),
                onSubmit: (values) =>
                  update(
                    {
                      objective_id:
                        values.objective === "__none__"
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
              icon: UserRound,
              category: "primary",
              requiresForm: {
                ...selectField("assignee", tIssueUI("changeAssigneeAria"), [
                  { value: "__none__", label: tField("unassigned") },
                  ...req.members.map((m) => ({
                    value: m.user_id,
                    label: displayName(m),
                  })),
                ]),
                onSubmit: (values) =>
                  update(
                    {
                      assignee_id:
                        values.assignee === "__none__"
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
  }, [bulkRequest, tIssueUI, tStatus, tPriority, tField]);

  const providers = useMemo(
    () => [issueProvider, entityProvider, themeProvider, savedViewProvider, bulkFieldProvider],
    [issueProvider, entityProvider, themeProvider, savedViewProvider, bulkFieldProvider]
  );

  // In bulk mode, the palette displays the selection options instead of the
  // normal content (navigation, creation, etc.).
  const showBulk = bulkMode && !!bulkRequest;
  const paletteItems = showBulk ? bulkItems : items;
  const paletteCategories = showBulk ? bulkCategories : categories;

  return (
    <CommandPaletteShell
      isOpen={open}
      onClose={() => onOpenChange(false)}
      items={paletteItems}
      categories={paletteCategories}
      providers={providers}
      locale={locale}
      // The page project is a BOOST of relevance, not a filter: its
      // tickets and objectives go up, those of other projects remain there.
      actionContext={currentProjectId ? { contextId: currentProjectId } : undefined}
      storagePrefix="minddy-cp"
      actionsShortcutKey=";"
      favorites={favorites}
      onToggleFavorite={handleToggleFavorite}
      onToast={(message, type) => {
        if (type === "error") toast.error(message);
        else if (type === "success") toast.success(message);
        else toast(message);
      }}
    />
  );
}
