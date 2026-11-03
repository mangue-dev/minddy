"use client";

import { FilterMenu, filterFacet, filterToggle } from "@/components/filter-menu";
import { ObjectivePill } from "@/components/objective-label";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { Add01Icon, ArrowDown01Icon, ArrangeByLettersAZIcon, AiAutoRotateIcon as CycleIcon, ArrowUpRight01Icon, Delete02Icon, FilterIcon, FloppyDiskIcon, LinkSquare01Icon, LoaderCircleIcon, LockIcon, MoreHorizontalIcon, Edit04Icon, Plug01Icon, Share01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { DragCursor } from "@/components/drag-cursor";
import { DRAG_ACTIVATION_DISTANCE, DRAGGED_PILL_BG, HORIZONTAL_DRAG, SETTLE_DROP_ANIMATION } from "@/lib/drag-feel";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SplitButton } from "@/components/ui/split-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PriorityIndicator } from "@/components/issue-indicators";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { UserAvatar } from "@/components/user-avatar";
import { NumoIcon } from "@/components/numo-icon";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { SearchSelect } from "@/components/search-select";
import { AppContentHeader } from "@/components/app-content-header";
import { ProjectOrb } from "@/components/project-orb";
import { ProgressRing } from "@/components/progress-ring";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ShareViewDialog, prefetchViewShare } from "@/components/share-view-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "@/components/form-dialog";
import { useDragAnnouncements, useStripInstructions } from "@/lib/use-drag-announcements";
import {
  PRIORITIES,
  EFFORTS,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import {
  ME_ASSIGNEE,
  activeFilterCount,
  isDefaultStatusFilter,
  isDirectionalSort,
  reverseSortDirection,
} from "@/lib/view-filter";
import { useStatusFilterActions } from "@/components/status-filter-menu";
import { CYCLE_TAB_KEY, mergeTabOrder } from "@/lib/tab-order";
import { useTabOrderQuery } from "@/lib/use-tab-order-query";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { displayName } from "@/lib/display-name";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";
import type {
  Category,
  Member,
  Objective,
  Project,
  SortDirection,
  View,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SORTS: ViewSort[] = ["smart", "manual", "priority", "created", "updated", "due"];

// Shared tab-pill styling — used by the sortable pills AND the drag overlay, so
// the dragged copy is pixel-identical. `shrink-0` keeps a pill at its natural
// width (the strip wraps instead of squishing pills).
const PILL_CLASS =
  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors";
const pillTone = (active: boolean) =>
  active
    ? "bg-foreground text-background"
    : "text-muted-foreground hover:bg-muted";

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/** Minimal shape the integration facet needs (the global board feeds slim
    cross-project refs, the project board feeds full Integration rows). */
type IntegrationFacet = { id: string; name: string };

/** One filter row for a category/objective/integration facet. `ids` is the set
    of underlying entity ids the row covers — a single id normally, but several
    when the same name spans projects (global board, group-by-name). */
interface FacetOption {
  /** Stable React key + identity: the name when grouped, else the id. */
  key: string;
  label: string;
  color?: string | null;
  ids: string[];
}

/** Flatten entities into filter rows. When `groupByName`, same-named entities
    (e.g. a "Bug" category present in several projects) collapse into ONE row
    spanning all their ids — the cross-project "flat list" the global board
    shows. Otherwise each entity is its own row (project board, unchanged). */
function buildFacetOptions<T extends { id: string; name: string }>(
  items: T[],
  groupByName: boolean,
  colorOf?: (item: T) => string | null | undefined
): FacetOption[] {
  if (!groupByName) {
    return items.map((it) => ({
      key: it.id,
      label: it.name,
      color: colorOf?.(it) ?? null,
      ids: [it.id],
    }));
  }
  const byName = new Map<string, FacetOption>();
  for (const it of items) {
    const existing = byName.get(it.name);
    if (existing) {
      existing.ids.push(it.id);
      if (existing.color == null) existing.color = colorOf?.(it) ?? null;
    } else {
      byName.set(it.name, {
        key: it.name,
        label: it.name,
        color: colorOf?.(it) ?? null,
        ids: [it.id],
      });
    }
  }
  return [...byName.values()];
}

/** True when any of a row's ids is currently selected. */
function facetActive(
  selected: readonly (string | null)[] | undefined,
  ids: string[]
): boolean {
  return ids.some((id) => selected?.includes(id));
}

/** Toggle a whole id-group at once: if any id is on, remove them all; else add
    them all. Keeps `filterIssues` id-based while the UI groups by name. */
function toggleFacet<T extends string | null>(
  selected: T[] | undefined,
  ids: T[]
): T[] {
  const set = new Set<T>(selected ?? []);
  const active = ids.some((id) => set.has(id));
  for (const id of ids) {
    if (active) set.delete(id);
    else set.add(id);
  }
  return [...set];
}


function FiltersPopover({
  config,
  onChange,
  members,
  categories,
  objectives,
  integrations,
  projects,
  groupFacetsByName,
  lockedToMe,
  withAI,
  onAskAI,
}: {
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  integrations: IntegrationFacet[];
  /** Global board only — a project board has no project facet. */
  projects: Project[];
  /** Global board: collapse same-named category/objective/integration rows
      across projects into one (each row then filters all matching ids). */
  groupFacetsByName: boolean;
  /** System view: the assignee facet is pinned to "@me" and not editable. */
  lockedToMe: boolean;
  /** “Create with Numo” rides when the board has an AI scope (MIN-592). */
  withAI: boolean;
  /** Hand the typed wish to Numo (the conversation, view context attached);
      an empty wish opens the Numo composer instead. */
  onAskAI: (wish: string) => void;
}) {
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const myAvatarSource = useMyAvatarSource();
  // "Assigned to me" shows the viewer's own face, like the "My issues" tab.
  const myAvatar = myAvatarSource ? (
    <UserAvatar seed={myAvatarSource} className="size-4 shrink-0 rounded-full" aria-hidden />
  ) : (
    <HugeiconsIcon icon={UserCircleIcon} className="size-4 shrink-0 text-muted-foreground" />
  );
  const tSort = useTranslations("Sort");
  const tp = useTranslations("Priority");
  const statusActions = useStatusFilterActions(f.status, (status) => setFilters({ ...f, status }));

  const categoryOptions = useMemo(
    () => buildFacetOptions(categories, groupFacetsByName, (c) => c.color),
    [categories, groupFacetsByName]
  );
  const objectiveOptions = useMemo(
    () => buildFacetOptions(objectives, groupFacetsByName, (o) => o.color),
    [objectives, groupFacetsByName]
  );
  const objectiveStatusById = useMemo(
    () => new Map(objectives.map((o) => [o.id, o.status])),
    [objectives]
  );
  const integrationOptions = useMemo(
    () => buildFacetOptions(integrations, groupFacetsByName),
    [integrations, groupFacetsByName]
  );

  const sortDirection: SortDirection = config.display.sortDirection ?? "asc";

  const assigneeOptions: ContextMenuAction[] = lockedToMe
    ? [{
        // System view: nothing else to pick — one inert locked row.
        id: "me",
        label: tf("assignedToMe"),
        icon: myAvatar,
        disabled: true,
        trailing: <HugeiconsIcon icon={LockIcon} className="size-3.5 shrink-0 text-muted-foreground" />,
      }]
    : [
        filterToggle({
          id: "me",
          label: tf("assignedToMe"),
          icon: myAvatar,
          active: !!f.assignee?.includes(ME_ASSIGNEE),
          onToggle: () => setFilters({ ...f, assignee: toggle(f.assignee, ME_ASSIGNEE) }),
        }),
        filterToggle({
          id: "unassigned",
          label: tf("unassigned"),
          active: !!f.assignee?.includes(null),
          onToggle: () => setFilters({ ...f, assignee: toggle(f.assignee, null) }),
        }),
        ...members.map((m) => filterToggle({
          id: m.user_id,
          label: displayName(m),
          active: !!f.assignee?.includes(m.user_id),
          onToggle: () => setFilters({ ...f, assignee: toggle(f.assignee, m.user_id) }),
        })),
      ];

  const facets: ContextMenuAction[] = [
    ...(projects.length > 0
      ? [filterFacet({
          id: "project",
          label: tf("project"),
          count: f.project?.length ?? 0,
          children: projects.map((p) => filterToggle({
            id: p.id,
            label: p.name,
            icon: <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-4 shrink-0" />,
            active: !!f.project?.includes(p.id),
            onToggle: () => setFilters({ ...f, project: toggle<string>(f.project, p.id) }),
          })),
        })]
      : []),
    filterFacet({
      id: "status",
      label: tf("status"),
      count: isDefaultStatusFilter(f.status) ? 0 : f.status?.length ?? 0,
      children: statusActions,
    }),
    filterFacet({
      id: "priority",
      label: tf("priority"),
      count: f.priority?.length ?? 0,
      children: PRIORITIES.map((p) => filterToggle({
        id: p.value,
        label: tp(p.value),
        icon: <PriorityIndicator priority={p.value} className="size-4" />,
        active: !!f.priority?.includes(p.value),
        onToggle: () => setFilters({ ...f, priority: toggle<IssuePriority>(f.priority, p.value) }),
      })),
    }),
    filterFacet({
      id: "assignee",
      label: tf("assignee"),
      count: f.assignee?.length ?? 0,
      children: assigneeOptions,
    }),
    filterFacet({
      id: "effort",
      label: tf("effort"),
      count: f.effort?.length ?? 0,
      children: [
        filterToggle({
          id: "none",
          label: tf("effortNone"),
          active: !!f.effort?.includes(null),
          onToggle: () => setFilters({ ...f, effort: toggle(f.effort, null) }),
        }),
        ...EFFORTS.map((e) => filterToggle({
          id: e.value,
          label: e.label,
          icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
          active: !!f.effort?.includes(e.value),
          onToggle: () => setFilters({ ...f, effort: toggle<IssueEffort | null>(f.effort, e.value) }),
        })),
      ],
    }),
    ...(categoryOptions.length > 0
      ? [filterFacet({
          id: "category",
          label: tf("categories"),
          count: f.category?.length ?? 0,
          children: categoryOptions.map((o) => filterToggle({
            id: o.key,
            label: o.label,
            icon: (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                aria-hidden
              />
            ),
            active: facetActive(f.category, o.ids),
            onToggle: () => setFilters({ ...f, category: toggleFacet(f.category, o.ids) }),
          })),
        })]
      : []),
    ...(objectiveOptions.length > 0
      ? [filterFacet({
          id: "objective",
          label: tf("objective"),
          count: f.objective?.length ?? 0,
          children: [
            filterToggle({
              id: "none",
              label: tf("noObjective"),
              active: !!f.objective?.includes(null),
              onToggle: () => setFilters({ ...f, objective: toggle(f.objective, null) }),
            }),
            ...objectiveOptions.map((o) => filterToggle({
              id: o.key,
              label: o.label,
              // The objective's pill, as everywhere it is named (MIN-785).
              labelNode: (
                <ObjectivePill
                  objective={{
                    name: o.label,
                    color: o.color ?? null,
                    status: objectiveStatusById.get(o.ids[0]),
                  }}
                />
              ),
              active: facetActive(f.objective, o.ids),
              onToggle: () => setFilters({ ...f, objective: toggleFacet(f.objective, o.ids) }),
            })),
          ],
        })]
      : []),
    ...(integrationOptions.length > 0
      ? [filterFacet({
          id: "integration",
          label: tf("integration"),
          count: f.integration?.length ?? 0,
          children: [
            filterToggle({
              id: "none",
              label: tf("noIntegration"),
              active: !!f.integration?.includes(null),
              onToggle: () => setFilters({ ...f, integration: toggle(f.integration, null) }),
            }),
            ...integrationOptions.map((o) => filterToggle({
              id: o.key,
              label: o.label,
              icon: <HugeiconsIcon icon={Plug01Icon} className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />,
              active: facetActive(f.integration, o.ids),
              onToggle: () => setFilters({ ...f, integration: toggleFacet(f.integration, o.ids) }),
            })),
          ],
        })]
      : []),
    filterToggle({
      id: "hide-done",
      label: t("hideDone"),
      separatorBefore: true,
      active: !!config.display.hideDone,
      onToggle: () => onChange({
        ...config,
        display: { ...config.display, hideDone: !config.display.hideDone },
      }),
    }),
    filterToggle({
      id: "hide-recurring",
      label: t("hideRecurring"),
      active: !!config.display.hideRecurring,
      onToggle: () => onChange({
        ...config,
        display: { ...config.display, hideRecurring: !config.display.hideRecurring },
      }),
    }),
    // Order — moved into the menu (MIN-592), with the direction invert right
    // under the sort list. The invert reads like a checked option (MIN-592
    // review): the check marks that the direction is the reversed one. Not
    // available for "smart" and "manual" — they carry their own order.
    filterFacet({
      id: "order",
      label: tf("order"),
      count: 0,
      separatorBefore: true,
      children: [
        ...SORTS.map((s) => filterToggle({
          id: s,
          label: tSort(s),
          active: config.sort === s,
          onToggle: () => onChange({ ...config, sort: s }),
        })),
        filterToggle({
          id: "reverse",
          label: t("reverseOrder"),
          separatorBefore: true,
          icon: <HugeiconsIcon icon={ArrangeByLettersAZIcon} className="text-muted-foreground" />,
          disabled: !isDirectionalSort(config.sort),
          active: sortDirection === "desc",
          onToggle: () => {
            if (!isDirectionalSort(config.sort)) return;
            onChange({
              ...config,
              display: { ...config.display, sortDirection: reverseSortDirection(sortDirection) },
            });
          },
        }),
      ],
    }),
  ];

  // “Create with Numo” (MIN-592): the first row of the menu while nothing is
  // typed, the last one once a search is typed. With a query, it hands that
  // text to the Numo conversation (the classifier pass proved unreliable for
  // filter selection; the conversation agent, with its hardened view tools,
  // is the reliable path) with the view context attached; with none, it
  // opens the Numo composer.
  const actions = (query: string): ContextMenuAction[] => {
    const wish = query.trim();
    if (!withAI) return facets;
    const label = t("createWithNumo");
    const numo: ContextMenuAction = {
      id: "create-with-numo",
      label,
      searchFallback: true,
      separatorBefore: true,
      transfersFocus: true,
      icon: <NumoIcon animated={false} className="size-4 shrink-0 text-primary" />,
      labelNode: wish ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0">{label}</span>
          <span className="truncate text-muted-foreground">{wish}</span>
        </span>
      ) : undefined,
      onSelect: () => onAskAI(wish),
    };
    // The facets open under a separator while the Numo row leads the list.
    const [first, ...rest] = facets;
    return [numo, { ...first, separatorBefore: !wish }, ...rest];
  };

  return (
    <FilterMenu
      label={tc("filters")}
      actions={actions}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={tc("filters")}>
          <HugeiconsIcon icon={FilterIcon} className={cn(count > 0 && "text-primary")} />
        </Button>
      }
    />
  );
}

function ViewNameDialog({
  open,
  onOpenChange,
  title,
  initialName,
  onSubmit,
  withDescription = false,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName: string;
  onSubmit: (name: string, description?: string) => Promise<void>;
  /** Show a "describe the view to Numo" field (create flow only). */
  withDescription?: boolean;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const tc = useTranslations("Common");
  const t = useTranslations("Board");
  // ⌘/Ctrl + Enter validates the view — from the name as well as from the instruction
  // to Numo, where Enter only moves to line.
  const submitShortcut = useSubmitShortcut();

  // Start from `initialName` each time you open. `open` is controlled from the
  // parent (setting `renameTarget` is enough to open): Radix then does NOT call
  // `onOpenChange`, so seeding it there left the “Rename” field empty.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription("");
  }, [open, initialName]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="sm:max-w-sm"
      formProps={submitShortcut}
      submitLabel={submitLabel ?? tc("save")}
      cancelLabel={tc("cancel")}
      submitDisabled={!name.trim()}
      submitting={busy}
      onSubmit={async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        try {
          await onSubmit(trimmed, withDescription ? description.trim() || undefined : undefined);
          onOpenChange(false);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      dictation={withDescription ? {
        context: "agent_instruction",
        onTranscription: (text) => setDescription((value) => `${value}${value ? " " : ""}${text}`),
        disabled: busy,
      } : undefined}
    >
          <Input
            autoFocus={allowInputAutoFocus()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("viewNamePlaceholder")}
          />
          {withDescription && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <NumoIcon animated={false} className="size-3.5 text-primary" />
                {t("aiDescribeView")}
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("viewDescriptionPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
          )}
    </FormDialog>
  );
}

export function BoardToolbar({
  views,
  activeViewId,
  generatingViewIds,
  onSelectView,
  config,
  onConfigChange,
  members,
  categories,
  objectives,
  integrations,
  projects = [],
  groupFacetsByName = false,
  dirty,
  onCreateView,
  onUpdateActiveView,
  onRenameView,
  onDeleteView,
  withNumo = true,
  withShare = true,
  onAskAI,
  cycleTab,
  rightControls,
  tabOrderScope,
  viewHref,
}: {
  views: View[];
  activeViewId: string | null;
  generatingViewIds: Set<string>;
  onSelectView: (id: string | null) => void;
  config: ViewConfig;
  onConfigChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  integrations: IntegrationFacet[];
  /** Global board only: enables the project facet in the filters popover. */
  projects?: Project[];
  /** Global board: collapse same-named category/objective/integration rows
      across projects into one flat cross-project list. */
  groupFacetsByName?: boolean;
  dirty: boolean;
  onCreateView: (name: string, description?: string) => Promise<void>;
  onUpdateActiveView: () => Promise<void>;
  onRenameView: (view: View, name: string) => Promise<void>;
  onDeleteView: (view: View) => Promise<void>;
  /** The AI affordances (filters input, new-view dialog) are project-scoped —
      the global board hides them. */
  withNumo?: boolean;
  /** Global views are not shareable (v1) — the global board hides Share. */
  withShare?: boolean;
  /** The filters menu's AI input hands the typed wish here (MIN-592) — the
      board opens its AI conversation with the active view as context. */
  onAskAI?: (wish: string) => void;
  /** The "Cycle" pill (MIN-32), after the view pills. `external` renders the ↗
      icon — a project board's pill that navigates to /all in cycle mode.
      `completionPercent` replaces its cycle glyph while a current cycle exists. */
  cycleTab?: {
    active: boolean;
    external?: boolean;
    completionPercent?: number | null;
    onSelect: () => void;
  };
  /** Cycle mode: replaces the whole right cluster (save/sort/filters/options)
      — the special view has no use for them. */
  rightControls?: React.ReactNode;
  /** Scope key for the per-user tab-strip order (MIN-34): a project id, or
      "global" for the /all board. Drag reorder persists to localStorage here. */
  tabOrderScope: string;
  /** Deep link for a saved view, or the cycle pill when `view` is null. */
  viewHref: (view: View | null) => string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  // "Save as new view" from the Save split button: same create flow, but the
  // config to save already exists — no Numo description step.
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<View | null>(null);
  const [shareTarget, setShareTarget] = useState<View | null>(null);
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<View | null>(null);
  // Right click on a pill (MIN-135): the targeted view + the anchor point of the
  // menu. This is the CLICKED view, not the active one — the “⋯” menu remains on
  // activates it. `view: null` = the “Cycle” pill, which is not a view.
  const [viewMenu, setViewMenu] = useState<{
    view: View | null;
    x: number;
    y: number;
  } | null>(null);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tApi = useTranslations("ApiErrors");
  const tActions = useTranslations("CommandPaletteActions");
  const appTabs = useOptionalAppTabSession();
  // The "Mes tickets" pill wears MY avatar, not a generic person glyph.
  const myAvatarSource = useMyAvatarSource();

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  // The system view is neither renamable, nor deletable, nor unlockable.
  const isSystem = activeView?.kind === "my";
  const customCount = views.filter((v) => v.kind !== "my").length;
  const openViewInNewTab = useCallback(
    (view: View | null) => {
      const href = viewHref(view);
      if (appTabs) {
        void appTabs.create(href);
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    },
    [appTabs, viewHref],
  );

  // ── Tab reorder (MIN-34) ────────────────────────────────────────────────
  // The strip = view pills + the Cycle pill, all drag-reorderable. The order is
  // per-user/per-scope, DB-backed (user_metadata) — the Cycle pill is a board
  // mode, not a `views` row, so it can't share the DB `position` column, and the
  // whole strip order is kept together. `views` already carries the default
  // order from useBoardViews; the stored order is a permutation over it.
  const hasCycle = Boolean(cycleTab);
  const viewById = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);
  const defaultTabKeys = useMemo(
    () => [...views.map((v) => v.id), ...(hasCycle ? [CYCLE_TAB_KEY] : [])],
    [views, hasCycle]
  );
  const { order: storedOrder, setOrder } = useTabOrderQuery(tabOrderScope);
  const savedTabKeys = useMemo(
    () => mergeTabOrder(defaultTabKeys, storedOrder),
    [defaultTabKeys, storedOrder]
  );
  // The order of the last drop, held until the saved order catches up: the
  // cache notifies a tick after the drop, and the dragged pill showed (and
  // its copy settled on) its old place in between.
  const [dropOrder, setDropOrder] = useState<string[] | null>(null);
  const savedTabOrder = savedTabKeys.join(",");
  useEffect(() => {
    if (!dropOrder) return;
    if (dropOrder.length !== savedTabKeys.length || dropOrder.join(",") === savedTabOrder) {
      setDropOrder(null);
      return;
    }
    const timer = window.setTimeout(() => setDropOrder(null), 2000);
    return () => window.clearTimeout(timer);
  }, [dropOrder, savedTabOrder, savedTabKeys.length]);
  const tabKeys = dropOrder && dropOrder.length === savedTabKeys.length ? dropOrder : savedTabKeys;
  const viewInstructions = useStripInstructions("view");
  const tabAnnouncements = useDragAnnouncements((id) => {
    if (id === CYCLE_TAB_KEY) return t("cycleTab");
    const view = viewById.get(String(id));
    return view?.kind === "my" ? t("myView") : view?.name;
  });
  const tabSensors = useSensors(
    // MouseSensor + a small distance so a plain click still selects the view;
    // only a >6px drag starts a reorder (same pattern as the issue cards).
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } })
  );
  // The pill currently being dragged — rendered in a fixed-size DragOverlay so
  // it never stretches/squishes to match the slot it hovers.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeDragView = activeTabId ? viewById.get(activeTabId) ?? null : null;
  const handleTabDragEnd = (event: DragEndEvent) => {
    setActiveTabId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = tabKeys.indexOf(String(active.id));
    const to = tabKeys.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    // Optimistic: shown in this very frame, then setOrder patches the cache
    // and persists.
    const next = arrayMove(tabKeys, from, to);
    setDropOrder(next);
    void setOrder(next).catch((err) => {
      console.error("[board-toolbar] tab order save failed", err);
      toast.error(tApi("tabOrderSaveFailed"));
    });
  };

  // ── Context menu of a pill (MIN-135) ────────────────────────────────
  // The same inputs as the “⋯” button, but carried by the clicked view.
  // The dialogs (rename / share / delete) below already accept
  // any view, such as useBoardViews handlers.
  // Any pill opens the menu, including “My tickets” and “Cycle”: the list
  // of actions is the same everywhere, what does not apply is grayed out. A
  // menu that sometimes only appears reads like a bug.
  const openViewMenu = (view: View | null, e: React.MouseEvent) => {
    e.preventDefault();
    // The menu offers Share: its dialog then opens on a loaded state.
    if (withShare && view) prefetchViewShare(queryClient, view.id);
    setViewMenu({ view, x: e.clientX, y: e.clientY });
  };
  const viewMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!viewMenu) return [];
    const view = viewMenu.view;
    // Neither the “Cycle” pill (not a view) nor the system view is renamed or
    // are not deleted; the system view is shared, the “Cycle” pill is not.
    const editable = view !== null && view.kind !== "my";
    const actions: ContextMenuAction[] = [
      {
        id: "open-new-tab",
        label: tActions("openInNewTab"),
        icon: <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />,
        onSelect: () => openViewInNewTab(view),
      },
      {
        id: "rename",
        label: t("renameView"),
        icon: <HugeiconsIcon icon={Edit04Icon} className="size-4" />,
        disabled: !editable,
        onSelect: () => view && setRenameTarget(view),
      },
    ];
    if (withShare) {
      actions.push({
        id: "share",
        label: t("shareView"),
        icon: <HugeiconsIcon icon={Share01Icon} className="size-4" />,
        disabled: view === null,
        onSelect: () => view && setShareTarget(view),
      });
    }
    actions.push({
      id: "delete",
      label: t("deleteView"),
      icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
      variant: "destructive",
      separatorBefore: true,
      // A board keeps at least one custom view (same rule as “⋯”).
      disabled: !editable || customCount <= 1,
      onSelect: () => view && setDeleteTarget(view),
    });
    return actions;
  }, [viewMenu, withShare, customCount, t, tActions, openViewInNewTab]);

  return (
    <>
      {/* The view pills are 28px tall, not the header's 32px controls: 2px
          more inset on the left keeps the first one concentric with the
          pane's corner (globals.css, `--app-pane-radius`). */}
      <AppContentHeader contentClassName="gap-2 pl-[calc(var(--app-content-header-pad-x)+2px)]">
        {/* Views bar — pills (views + Cycle) are drag-reorderable; the "+"
            stays fixed at the end. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 app-desktop:hidden">
          <SearchSelect
            menuActions={[{ id: "create-view", label: t("newView"), icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />, onSelect: () => setCreateOpen(true) }]}
            value={cycleTab?.active ? CYCLE_TAB_KEY : activeViewId}
            onChange={(id) => { if (id === CYCLE_TAB_KEY) cycleTab?.onSelect(); else if (id) onSelectView(id); }}
            options={tabKeys.flatMap((key) => {
              if (key === CYCLE_TAB_KEY) return cycleTab ? [{ value: key, label: t("cycleTab") }] : [];
              const view = viewById.get(key);
              return view ? [{ value: key, label: view.kind === "my" ? t("myView") : view.name }] : [];
            })}
            trigger={<Button variant="ghost" size="sm" className="min-w-0 max-w-full justify-start gap-2">
              <span className="truncate">{cycleTab?.active ? t("cycleTab") : activeView?.kind === "my" ? t("myView") : activeView?.name ?? t("newView")}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
            </Button>}
          />
        </div>
        <div className="hidden shrink-0 items-center gap-1 app-desktop:flex">
          <DndContext
            sensors={tabSensors}
            accessibility={{ announcements: tabAnnouncements, screenReaderInstructions: viewInstructions }}
            collisionDetection={closestCenter}
            // Along the strip only, like the app's tabs.
            modifiers={HORIZONTAL_DRAG}
            onDragStart={(event: DragStartEvent) =>
              setActiveTabId(String(event.active.id))
            }
            onDragEnd={handleTabDragEnd}
            onDragCancel={() => setActiveTabId(null)}
          >
            <DragCursor />
            <SortableContext
              items={tabKeys}
              strategy={horizontalListSortingStrategy}
            >
              {tabKeys.map((key) => {
                if (key === CYCLE_TAB_KEY) {
                  return cycleTab ? (
                    <CycleTab
                      key={key}
                      active={cycleTab.active}
                      external={cycleTab.external}
                      completionPercent={cycleTab.completionPercent}
                      onSelect={cycleTab.onSelect}
                      onContextMenu={(e) => openViewMenu(null, e)}
                    />
                  ) : null;
                }
                const v = viewById.get(key);
                if (!v) return null;
                return (
                  <ViewChip
                    key={v.id}
                    view={v}
                    active={v.id === activeViewId}
                    generating={generatingViewIds.has(v.id)}
                    avatarSeed={myAvatarSource}
                    onSelect={() => onSelectView(v.id)}
                    onContextMenu={(e) => openViewMenu(v, e)}
                  />
                );
              })}
            </SortableContext>
            {/* Fixed-size copy of the dragged pill (portaled). The reorder is
                optimistic: released, the copy settles onto the pill in its
                new place, or back at its origin after a cancel. */}
            <DragOverlay dropAnimation={SETTLE_DROP_ANIMATION}>
              {activeTabId === CYCLE_TAB_KEY && cycleTab ? (
                <div className={cn(PILL_CLASS, pillTone(cycleTab.active), !cycleTab.active && DRAGGED_PILL_BG, "shadow-md")}>
                  {cycleTab.completionPercent === null ||
                  cycleTab.completionPercent === undefined ? (
                    <AppIcon icon={CycleIcon} className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <ProgressRing
                      percent={cycleTab.completionPercent}
                      colorClass="text-emerald-500"
                      className="size-3"
                    />
                  )}
                  {t("cycleTab")}
                  {cycleTab.external && (
                    <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden />
                  )}
                </div>
              ) : activeDragView ? (
                <div
                  className={cn(
                    PILL_CLASS,
                    pillTone(activeDragView.id === activeViewId),
                    activeDragView.id !== activeViewId && DRAGGED_PILL_BG,
                    "shadow-md"
                  )}
                >
                  {generatingViewIds.has(activeDragView.id) && (
                    <HugeiconsIcon icon={LoaderCircleIcon} className="size-3 shrink-0 animate-spin" />
                  )}
                  {activeDragView.kind === "my" &&
                    (myAvatarSource ? (
                      <UserAvatar
                        seed={myAvatarSource}
                        className="size-3 rounded-full"
                        aria-hidden
                      />
                    ) : (
                      <span
                        aria-hidden className="block size-3 shrink-0 rounded-full bg-current opacity-30"
                      />
                    ))}
                  {activeDragView.kind === "my"
                    ? t("myView")
                    : activeDragView.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("newView")}
                onClick={() => setCreateOpen(true)}
              >
                <HugeiconsIcon icon={Add01Icon} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("newView")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {rightControls ?? (
            <>
          {dirty && activeView && (
            <SplitButton
              size="sm"
              onClick={() => void onUpdateActiveView()}
              menuLabel={t("saveOptions")}
              menu={
                <DropdownMenuItem onSelect={() => setSaveAsOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("saveAsNewView")}
                </DropdownMenuItem>
              }
            >
              <HugeiconsIcon icon={FloppyDiskIcon} />
              {tc("save")}
            </SplitButton>
          )}
          {dirty && !activeView && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={FloppyDiskIcon} />
              {t("saveAsView")}
            </Button>
          )}

          {/* Filters — icon only, accent-coloured when any filter is active.
              The order (sort) now lives inside the menu (MIN-592). */}
          <FiltersPopover
            config={config}
            onChange={onConfigChange}
            members={members}
            categories={categories}
            objectives={objectives}
            integrations={integrations}
            projects={projects}
            groupFacetsByName={groupFacetsByName}
            lockedToMe={isSystem}
            withAI={withNumo}
            onAskAI={(wish) => onAskAI?.(wish)}
          />

          {/* Active view actions — rename / share / delete (the system view
              only shares; without Share the menu would be empty → disabled) */}
          <DropdownMenu
            onOpenChange={(open) => {
              if (open && withShare && activeView) prefetchViewShare(queryClient, activeView.id);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!activeView}
                    aria-label={t("viewOptions", { name: activeView?.name ?? "" })}
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {t("viewOptions", { name: activeView?.name ?? "" })}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {activeView && (
                <DropdownMenuItem onSelect={() => openViewInNewTab(activeView)}>
                  <HugeiconsIcon icon={LinkSquare01Icon} />
                  {tActions("openInNewTab")}
                </DropdownMenuItem>
              )}
              {activeView && (!isSystem || withShare) && <DropdownMenuSeparator />}
              {!isSystem && (
                <DropdownMenuItem
                  onSelect={() => activeView && setRenameTarget(activeView)}
                >
                  <HugeiconsIcon icon={Edit04Icon} />
                  {t("renameView")}
                </DropdownMenuItem>
              )}
              {withShare && (
                <DropdownMenuItem
                  onSelect={() => activeView && setShareTarget(activeView)}
                >
                  <HugeiconsIcon icon={Share01Icon} />
                  {t("shareView")}
                </DropdownMenuItem>
              )}
              {!isSystem && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={customCount <= 1}
                    onSelect={() => activeView && setDeleteTarget(activeView)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    {t("deleteView")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
            </>
          )}
        </div>
      </AppContentHeader>

      <ViewNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("newView")}
        initialName=""
        onSubmit={onCreateView}
        withDescription={withNumo}
        submitLabel={withNumo ? tc("continue") : undefined}
      />
      <ViewNameDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        title={t("saveAsNewView")}
        initialName=""
        onSubmit={(name) => onCreateView(name)}
      />
      <ViewNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={t("renameViewTitle")}
        initialName={renameTarget?.name ?? ""}
        onSubmit={(name) =>
          renameTarget ? onRenameView(renameTarget, name) : Promise.resolve()
        }
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("deleteViewTitle", { name: deleteTarget?.name ?? "" })}
        description={t("deleteViewDescription")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        closeOnConfirm={false}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          try {
            await onDeleteView(target);
            setDeleteTarget(null);
          } catch {
            // The handler owns the error toast and keeps the dialog open.
          }
        }}
      />
      <IssueContextMenu
        position={viewMenu ? { x: viewMenu.x, y: viewMenu.y } : null}
        onClose={() => setViewMenu(null)}
        actions={viewMenuActions}
        searchable={false}
      />
      <ShareViewDialog
        view={shareTarget}
        open={shareTarget !== null}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
      />
    </>
  );
}

/** Drag wiring shared by every reorderable tab pill (MIN-34). The listeners go
    on the pill's own button; MouseSensor's distance constraint keeps a plain
    click firing onClick (select), only a drag starts the reorder. */
function useTabSortable(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  // A pill is a button: dnd-kit's English "draggable" role description would
  // replace that role's name for screen readers (3.1.2, 4.1.2).
  const { "aria-roledescription": _roleDescription, ...buttonAttributes } = attributes;
  return {
    setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    attributes: buttonAttributes,
    listeners,
    isDragging,
  };
}

function ViewChip({
  view,
  active,
  generating,
  avatarSeed,
  onSelect,
  onContextMenu,
}: {
  view: View;
  active: boolean;
  generating: boolean;
  /** My avatar source: the system view wears the real face, not a person glyph. */
  avatarSeed: string | null;
  onSelect: () => void;
  /** Right click on the pill: opens the actions menu of THIS view (MIN-135).
 The dnd-kit MouseSensor ignores the right button, so reordering by sliding is not affected. */
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("Board");
  // The system view's label follows the viewer's language (the stored name is
  // only for API consumers).
  const isSystem = view.kind === "my";
  const { setNodeRef, style, attributes, listeners, isDragging } = useTabSortable(
    view.id
  );
  const tab = (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(PILL_CLASS, pillTone(active), isDragging && "opacity-50")}
    >
      {generating && (
        <HugeiconsIcon icon={LoaderCircleIcon} className="size-3 shrink-0 animate-spin" aria-label={t("viewGenerating")} />
      )}
      {isSystem &&
        (avatarSeed ? (
          <UserAvatar seed={avatarSeed} className="size-3 rounded-full" aria-hidden />
        ) : (
          <span aria-hidden className="block size-3 shrink-0 rounded-full bg-current opacity-30" />
        ))}
      {isSystem ? t("myView") : view.name}
    </button>
  );
  return generating ? (
    <Tooltip>
      <TooltipTrigger asChild>{tab}</TooltipTrigger>
      <TooltipContent>{t("viewGenerating")}</TooltipContent>
    </Tooltip>
  ) : tab;
}

/** The (non-view) Cycle pill — reorderable like the view pills. */
function CycleTab({
  active,
  external,
  completionPercent,
  onSelect,
  onContextMenu,
}: {
  active: boolean;
  external?: boolean;
  /** Null when no current cycle exists; 0 is a valid empty current cycle. */
  completionPercent?: number | null;
  onSelect: () => void;
  /** Right click: the same menu as the views, entirely grayed out (MIN-135). */
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("Board");
  const { setNodeRef, style, attributes, listeners, isDragging } =
    useTabSortable(CYCLE_TAB_KEY);
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(PILL_CLASS, pillTone(active), isDragging && "opacity-50")}
    >
      {completionPercent === null || completionPercent === undefined ? (
        <AppIcon icon={CycleIcon} className="size-3 shrink-0" aria-hidden />
      ) : (
        <ProgressRing
          percent={completionPercent}
          colorClass="text-emerald-500"
          className="size-3"
        />
      )}
      {t("cycleTab")}
      {external && <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}
