"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  SplitButton,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  ArrowUpRight,
  Check,
  CircleUser,
  IterationCw,
  ListFilter,
  ArrowUpDown,
  Loader2,
  Lock,
  MoreHorizontal,
  Plug,
  Plus,
  Save,
  Pencil,
  Share2,
  Trash2,
  Triangle,
} from "lucide-react";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import { ShareViewDialog } from "@/components/share-view-dialog";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { ME_ASSIGNEE, activeFilterCount } from "@/lib/view-filter";
import { CYCLE_TAB_KEY, mergeTabOrder } from "@/lib/tab-order";
import { useTabOrderQuery } from "@/lib/use-tab-order-query";
import { displayName } from "@/lib/display-name";
import type {
  Category,
  Member,
  Objective,
  Project,
  View,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";

const SORTS: ViewSort[] = ["manual", "priority", "created", "updated", "due"];

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

function ToggleRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  );
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
  withNumo,
  onAskNumo,
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
  withNumo: boolean;
  onAskNumo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const ts = useTranslations("Status");
  const tp = useTranslations("Priority");

  const categoryOptions = useMemo(
    () => buildFacetOptions(categories, groupFacetsByName, (c) => c.color),
    [categories, groupFacetsByName]
  );
  const objectiveOptions = useMemo(
    () => buildFacetOptions(objectives, groupFacetsByName, (o) => o.color),
    [objectives, groupFacetsByName]
  );
  const integrationOptions = useMemo(
    () => buildFacetOptions(integrations, groupFacetsByName),
    [integrations, groupFacetsByName]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={tc("filters")}>
              <ListFilter className={cn(count > 0 && "text-primary")} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tc("filters")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-2">
        {withNumo && (
          <>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAskNumo();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <NumoIcon animated={false} className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{t("askNumo")}</span>
            </button>
            <Separator className="my-1.5" />
          </>
        )}
        {projects.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("project")}
            </p>
            {projects.map((p) => (
              <ToggleRow
                key={p.id}
                active={!!f.project?.includes(p.id)}
                onClick={() =>
                  setFilters({ ...f, project: toggle<string>(f.project, p.id) })
                }
              >
                <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </ToggleRow>
            ))}
            <Separator className="my-1.5" />
          </>
        )}
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("status")}</p>
        {STATUSES.map((s) => (
          <ToggleRow
            key={s.value}
            active={!!f.status?.includes(s.value)}
            onClick={() =>
              setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
            }
          >
            <StatusIndicator status={s.value} className="size-4" />
            {ts(s.value)}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("priority")}</p>
        {PRIORITIES.map((p) => (
          <ToggleRow
            key={p.value}
            active={!!f.priority?.includes(p.value)}
            onClick={() =>
              setFilters({
                ...f,
                priority: toggle<IssuePriority>(f.priority, p.value),
              })
            }
          >
            <PriorityIndicator priority={p.value} className="size-4" />
            {tp(p.value)}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("assignee")}</p>
        {lockedToMe ? (
          /* System view: nothing else to pick — one non-interactive locked row. */
          <div
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            aria-disabled
            title={t("myViewLockedHint")}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <CircleUser className="size-4 shrink-0 text-muted-foreground" />
              {tf("assignedToMe")}
            </span>
            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <>
            <ToggleRow
              active={!!f.assignee?.includes(ME_ASSIGNEE)}
              onClick={() =>
                setFilters({ ...f, assignee: toggle(f.assignee, ME_ASSIGNEE) })
              }
            >
              <CircleUser className="size-4 shrink-0 text-muted-foreground" />
              {tf("assignedToMe")}
            </ToggleRow>
            <ToggleRow
              active={!!f.assignee?.includes(null)}
              onClick={() => setFilters({ ...f, assignee: toggle(f.assignee, null) })}
            >
              {tf("unassigned")}
            </ToggleRow>
            {members.map((m) => (
              <ToggleRow
                key={m.user_id}
                active={!!f.assignee?.includes(m.user_id)}
                onClick={() =>
                  setFilters({ ...f, assignee: toggle(f.assignee, m.user_id) })
                }
              >
                <span className="truncate">{displayName(m)}</span>
              </ToggleRow>
            ))}
          </>
        )}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{tf("effort")}</p>
        {EFFORTS.map((e) => (
          <ToggleRow
            key={e.value}
            active={!!f.effort?.includes(e.value)}
            onClick={() =>
              setFilters({ ...f, effort: toggle<IssueEffort>(f.effort, e.value) })
            }
          >
            <Triangle className="size-4 text-muted-foreground" />
            {e.label}
          </ToggleRow>
        ))}

        {categoryOptions.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("categories")}
            </p>
            {categoryOptions.map((o) => (
              <ToggleRow
                key={o.key}
                active={facetActive(f.category, o.ids)}
                onClick={() =>
                  setFilters({ ...f, category: toggleFacet(f.category, o.ids) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.label}</span>
              </ToggleRow>
            ))}
          </>
        )}

        {objectiveOptions.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("objective")}
            </p>
            <ToggleRow
              active={!!f.objective?.includes(null)}
              onClick={() =>
                setFilters({ ...f, objective: toggle(f.objective, null) })
              }
            >
              {tf("noObjective")}
            </ToggleRow>
            {objectiveOptions.map((o) => (
              <ToggleRow
                key={o.key}
                active={facetActive(f.objective, o.ids)}
                onClick={() =>
                  setFilters({ ...f, objective: toggleFacet(f.objective, o.ids) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.label}</span>
              </ToggleRow>
            ))}
          </>
        )}

        {integrationOptions.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("integration")}
            </p>
            <ToggleRow
              active={!!f.integration?.includes(null)}
              onClick={() =>
                setFilters({ ...f, integration: toggle(f.integration, null) })
              }
            >
              {tf("noIntegration")}
            </ToggleRow>
            {integrationOptions.map((o) => (
              <ToggleRow
                key={o.key}
                active={facetActive(f.integration, o.ids)}
                onClick={() =>
                  setFilters({ ...f, integration: toggleFacet(f.integration, o.ids) })
                }
              >
                <Plug className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">{o.label}</span>
              </ToggleRow>
            ))}
          </>
        )}

        <Separator className="my-1.5" />
        <ToggleRow
          active={!!config.display.hideDone}
          onClick={() =>
            onChange({
              ...config,
              display: { ...config.display, hideDone: !config.display.hideDone },
            })
          }
        >
          {t("hideDone")}
        </ToggleRow>
        <ToggleRow
          active={!!config.display.hideRecurring}
          onClick={() =>
            onChange({
              ...config,
              display: {
                ...config.display,
                hideRecurring: !config.display.hideRecurring,
              },
            })
          }
        >
          {t("hideRecurring")}
        </ToggleRow>
      </PopoverContent>
    </Popover>
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

  // Repartir de `initialName` à chaque ouverture. `open` est piloté depuis le
  // parent (poser `renameTarget` suffit à ouvrir) : Radix n'appelle alors PAS
  // `onOpenChange`, donc le semer là laissait le champ « Renommer » vide.
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription("");
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            try {
              await onSubmit(
                trimmed,
                withDescription ? description.trim() || undefined : undefined
              );
              onOpenChange(false);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("viewNamePlaceholder")}
          />
          {withDescription && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <NumoIcon animated={false} className="size-3.5 text-primary" />
                {t("askNumoOptional")}
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
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {submitLabel ?? tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  onAskNumo,
  cycleTab,
  rightControls,
  tabOrderScope,
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
  /** Numo is project-scoped — the global board hides its affordances. */
  withNumo?: boolean;
  /** Global views are not shareable (v1) — the global board hides Share. */
  withShare?: boolean;
  onAskNumo: () => void;
  /** The "Cycle" pill (MIN-32), after the view pills. `external` renders the ↗
      icon — a project board's pill that navigates to /all in cycle mode. */
  cycleTab?: { active: boolean; external?: boolean; onSelect: () => void };
  /** Cycle mode: replaces the whole right cluster (save/sort/filters/options)
      — the special view has no use for them. */
  rightControls?: React.ReactNode;
  /** Scope key for the per-user tab-strip order (MIN-34): a project id, or
      "global" for the /all board. Drag reorder persists to localStorage here. */
  tabOrderScope: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  // "Save as new view" from the Save split button: same create flow, but the
  // config to save already exists — no Numo description step.
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<View | null>(null);
  const [shareTarget, setShareTarget] = useState<View | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<View | null>(null);
  // Clic droit sur une pill (MIN-135) : la vue visée + le point d'ancrage du
  // menu. C'est la vue CLIQUÉE, pas l'active — le menu « ⋯ », lui, reste sur
  // l'active. `view: null` = la pill « Cycle », qui n'est pas une vue.
  const [viewMenu, setViewMenu] = useState<{
    view: View | null;
    x: number;
    y: number;
  } | null>(null);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const tSort = useTranslations("Sort");
  const tApi = useTranslations("ApiErrors");

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  // The system view is neither renamable, nor deletable, nor unlockable.
  const isSystem = activeView?.kind === "my";
  const customCount = views.filter((v) => v.kind !== "my").length;

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
  const tabKeys = useMemo(
    () => mergeTabOrder(defaultTabKeys, storedOrder),
    [defaultTabKeys, storedOrder]
  );
  const tabSensors = useSensors(
    // MouseSensor + a small distance so a plain click still selects the view;
    // only a >6px drag starts a reorder (same pattern as the issue cards).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
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
    // Optimistic: setOrder patches the cache instantly, then persists.
    void setOrder(arrayMove(tabKeys, from, to)).catch((err) => {
      console.error("[board-toolbar] tab order save failed", err);
      toast.error(tApi("tabOrderSaveFailed"));
    });
  };

  // ── Menu contextuel d'une pill (MIN-135) ────────────────────────────────
  // Les mêmes entrées que le bouton « ⋯ », mais portées par la vue cliquée.
  // Les dialogs (renommer / partager / supprimer) plus bas acceptent déjà
  // n'importe quelle vue, comme les handlers de useBoardViews.
  // Toute pill ouvre le menu, y compris « Mes tickets » et « Cycle » : la liste
  // d'actions est la même partout, ce qui ne s'applique pas y est grisé. Un
  // menu qui apparaît parfois seulement se lit comme un bug.
  const openViewMenu = (view: View | null, e: React.MouseEvent) => {
    e.preventDefault();
    setViewMenu({ view, x: e.clientX, y: e.clientY });
  };
  const viewMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!viewMenu) return [];
    const view = viewMenu.view;
    // Ni la pill « Cycle » (pas une vue) ni la vue système ne se renomment ou
    // ne se suppriment ; la vue système se partage, la pill « Cycle » non.
    const editable = view !== null && view.kind !== "my";
    const actions: ContextMenuAction[] = [
      {
        id: "rename",
        label: t("renameView"),
        icon: <Pencil className="size-4" />,
        disabled: !editable,
        onSelect: () => view && setRenameTarget(view),
      },
    ];
    if (withShare) {
      actions.push({
        id: "share",
        label: t("shareView"),
        icon: <Share2 className="size-4" />,
        disabled: view === null,
        onSelect: () => view && setShareTarget(view),
      });
    }
    actions.push({
      id: "delete",
      label: t("deleteView"),
      icon: <Trash2 className="size-4" />,
      variant: "destructive",
      separatorBefore: true,
      // Un board garde au moins une vue custom (même règle que le « ⋯ »).
      disabled: !editable || customCount <= 1,
      onSelect: () => view && setDeleteTarget(view),
    });
    return actions;
  }, [viewMenu, withShare, customCount, t]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Views bar — pills (views + Cycle) are drag-reorderable; the "+"
            stays fixed at the end. */}
        <div className="flex flex-wrap items-center gap-1">
          <DndContext
            sensors={tabSensors}
            collisionDetection={closestCenter}
            onDragStart={(event: DragStartEvent) =>
              setActiveTabId(String(event.active.id))
            }
            onDragEnd={handleTabDragEnd}
            onDragCancel={() => setActiveTabId(null)}
          >
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
                    onSelect={() => onSelectView(v.id)}
                    onContextMenu={(e) => openViewMenu(v, e)}
                  />
                );
              })}
            </SortableContext>
            {/* Fixed-size copy of the dragged pill (portaled). dropAnimation
                null: the reorder is optimistic, the pill is already in place. */}
            <DragOverlay dropAnimation={null}>
              {activeTabId === CYCLE_TAB_KEY && cycleTab ? (
                <div className={cn(PILL_CLASS, pillTone(cycleTab.active))}>
                  <IterationCw className="size-3 shrink-0" aria-hidden />
                  {t("cycleTab")}
                  {cycleTab.external && (
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                  )}
                </div>
              ) : activeDragView ? (
                <div
                  className={cn(
                    PILL_CLASS,
                    pillTone(activeDragView.id === activeViewId)
                  )}
                >
                  {generatingViewIds.has(activeDragView.id) && (
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                  )}
                  {activeDragView.kind === "my" && (
                    <CircleUser className="size-3 shrink-0" aria-hidden />
                  )}
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
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("newView")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {rightControls ?? (
            <>
          {dirty && activeView && (
            <SplitButton
              size="sm"
              onClick={() => void onUpdateActiveView()}
              menuLabel={t("saveOptions")}
              menu={
                <DropdownMenuItem onSelect={() => setSaveAsOpen(true)}>
                  <Plus />
                  {t("saveAsNewView")}
                </DropdownMenuItem>
              }
            >
              <Save />
              {tc("save")}
            </SplitButton>
          )}
          {dirty && !activeView && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Save />
              {t("saveAsView")}
            </Button>
          )}

          {/* Order — icon only, accent-coloured when a non-default sort is active */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label={tf("order")}>
                    <ArrowUpDown
                      className={cn(config.sort !== "manual" && "text-primary")}
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{tf("order")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => onConfigChange({ ...config, sort: s })}
                >
                  {tSort(s)}
                  {config.sort === s && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filters — icon only, accent-coloured when any filter is active */}
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
            withNumo={withNumo}
            onAskNumo={onAskNumo}
          />

          {/* Active view actions — rename / share / delete (the system view
              only shares; without Share the menu would be empty → disabled) */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!activeView || (isSystem && !withShare)}
                    aria-label={t("viewOptions", { name: activeView?.name ?? "" })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {t("viewOptions", { name: activeView?.name ?? "" })}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {!isSystem && (
                <DropdownMenuItem
                  onSelect={() => activeView && setRenameTarget(activeView)}
                >
                  <Pencil />
                  {t("renameView")}
                </DropdownMenuItem>
              )}
              {withShare && (
                <DropdownMenuItem
                  onSelect={() => activeView && setShareTarget(activeView)}
                >
                  <Share2 />
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
                    <Trash2 />
                    {t("deleteView")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
            </>
          )}
        </div>
      </div>

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
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("deleteViewTitle", { name: deleteTarget?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("deleteViewDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                const target = deleteTarget;
                try {
                  await onDeleteView(target);
                  setDeleteTarget(null);
                } catch {
                  // The handler owns the error toast and keeps the dialog open.
                }
              }}
            >
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    </div>
  );
}

/** Drag wiring shared by every reorderable tab pill (MIN-34). The listeners go
    on the pill's own button; MouseSensor's distance constraint keeps a plain
    click firing onClick (select), only a drag starts the reorder. */
function useTabSortable(id: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    attributes,
    listeners,
    isDragging,
  };
}

function ViewChip({
  view,
  active,
  generating,
  onSelect,
  onContextMenu,
}: {
  view: View;
  active: boolean;
  generating: boolean;
  onSelect: () => void;
  /** Clic droit sur la pill : ouvre le menu d'actions de CETTE vue (MIN-135).
      Le MouseSensor de dnd-kit ignore le bouton droit, la réorganisation par
      glissement n'est donc pas concernée. */
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("Board");
  // The system view's label follows the viewer's language (the stored name is
  // only for API consumers).
  const isSystem = view.kind === "my";
  const { setNodeRef, style, attributes, listeners, isDragging } = useTabSortable(
    view.id
  );
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={generating ? t("viewGenerating") : undefined}
      className={cn(PILL_CLASS, pillTone(active), isDragging && "opacity-50")}
    >
      {generating && (
        <Loader2
          className="size-3 shrink-0 animate-spin"
          aria-label={t("viewGenerating")}
        />
      )}
      {isSystem && <CircleUser className="size-3 shrink-0" aria-hidden />}
      {isSystem ? t("myView") : view.name}
    </button>
  );
}

/** The (non-view) Cycle pill — reorderable like the view pills. */
function CycleTab({
  active,
  external,
  onSelect,
  onContextMenu,
}: {
  active: boolean;
  external?: boolean;
  onSelect: () => void;
  /** Clic droit : le même menu que les vues, entièrement grisé (MIN-135). */
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
      <IterationCw className="size-3 shrink-0" aria-hidden />
      {t("cycleTab")}
      {external && <ArrowUpRight className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}
