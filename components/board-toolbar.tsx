"use client";

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  SplitButton,
  Textarea,
  cn,
  toast,
} from "mangue-ui";
import {
  ArrowDownZA,
  ArrowUpAZ,
  ArrowUpRight,
  Check,
  CircleUser,
  IterationCw,
  ListFilter,
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
  ExternalLink,
} from "lucide-react";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { UserAvatar } from "@/components/user-avatar";
import { NumoIcon } from "@/components/numo-icon";
import { useMyAvatarSource } from "@/lib/use-my-avatar";
import { AppContentHeader } from "@/components/app-content-header";
import { ProjectOrb } from "@/components/project-orb";
import { ProgressRing } from "@/components/progress-ring";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ShareViewDialog } from "@/components/share-view-dialog";
import { FormDialog } from "@/components/form-dialog";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { ME_ASSIGNEE, activeFilterCount, isDirectionalSort, reverseSortDirection } from "@/lib/view-filter";
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

/** One toggle row inside a filter submenu — Linear style: clicking toggles
    WITHOUT closing the menu (onSelect preventDefault), the check sits on the
    right. */
function MenuToggleRow({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <Check className="size-4 shrink-0" />}
    </DropdownMenuItem>
  );
}

/** One facet submenu of the filters menu: the trigger carries the facet name
    and, when the facet is active, how many values are selected — a bare
    number, the same count treatment as the sidebar. */
function FilterSub({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
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
  /** The AI input rides when the board has an AI scope (MIN-592). */
  withAI: boolean;
  /** Hand the typed wish to the AI (the Numo conversation, view context
      attached) — the entry point of the filter request. */
  onAskAI: (wish: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [aiWish, setAiWish] = useState("");
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const tSort = useTranslations("Sort");
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

  const sortDirection: SortDirection = config.display.sortDirection ?? "asc";

  // The AI hand-off (MIN-592, review): the wish rides to the Numo
  // conversation — the classifier pass proved unreliable for filter
  // selection, the conversation agent (with its hardened view tools) is the
  // reliable path. The menu closes and the assistant opens with the view
  // context attached.
  const submitAiWish = () => {
    const wish = aiWish.trim();
    if (!wish) return;
    setOpen(false);
    setAiWish("");
    onAskAI(wish);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={tc("filters")}>
              <ListFilter className={cn(count > 0 && "text-primary")} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tc("filters")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60">
        {withAI && (
          <>
            {/* The AI input (MIN-592): write the wish, press Enter, the
                request opens the AI conversation carrying this board's view
                context. The keydown is stopped so the menu's own navigation
                never eats a keystroke. */}
            <div
              className="p-1"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitAiWish();
                }}
                className="flex items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-1 focus-within:ring-ring"
              >
                <NumoIcon animated={false} className="size-4 shrink-0 text-primary" />
                <Input
                  autoFocus
                  value={aiWish}
                  onChange={(event) => setAiWish(event.target.value)}
                  placeholder={t("aiFilterInput")}
                  aria-label={t("aiFilterInput")}
                  className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </form>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {projects.length > 0 && (
          <FilterSub label={tf("project")} count={f.project?.length ?? 0}>
            {projects.map((p) => (
              <MenuToggleRow
                key={p.id}
                active={!!f.project?.includes(p.id)}
                onSelect={() =>
                  setFilters({ ...f, project: toggle<string>(f.project, p.id) })
                }
              >
                <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
        )}
        <FilterSub label={tf("status")} count={f.status?.length ?? 0}>
          {STATUSES.map((s) => (
            <MenuToggleRow
              key={s.value}
              active={!!f.status?.includes(s.value)}
              onSelect={() =>
                setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
              }
            >
              <StatusIndicator status={s.value} className="size-4" />
              {ts(s.value)}
            </MenuToggleRow>
          ))}
        </FilterSub>
        <FilterSub label={tf("priority")} count={f.priority?.length ?? 0}>
          {PRIORITIES.map((p) => (
            <MenuToggleRow
              key={p.value}
              active={!!f.priority?.includes(p.value)}
              onSelect={() =>
                setFilters({
                  ...f,
                  priority: toggle<IssuePriority>(f.priority, p.value),
                })
              }
            >
              <PriorityIndicator priority={p.value} className="size-4" />
              {tp(p.value)}
            </MenuToggleRow>
          ))}
        </FilterSub>
        <FilterSub label={tf("assignee")} count={f.assignee?.length ?? 0}>
          {lockedToMe ? (
            /* System view: nothing else to pick — one non-interactive locked row. */
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                  aria-disabled
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <CircleUser className="size-4 shrink-0 text-muted-foreground" />
                    {tf("assignedToMe")}
                  </span>
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent>{t("myViewLockedHint")}</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <MenuToggleRow
                active={!!f.assignee?.includes(ME_ASSIGNEE)}
                onSelect={() =>
                  setFilters({ ...f, assignee: toggle(f.assignee, ME_ASSIGNEE) })
                }
              >
                <CircleUser className="size-4 shrink-0 text-muted-foreground" />
                {tf("assignedToMe")}
              </MenuToggleRow>
              <MenuToggleRow
                active={!!f.assignee?.includes(null)}
                onSelect={() => setFilters({ ...f, assignee: toggle(f.assignee, null) })}
              >
                {tf("unassigned")}
              </MenuToggleRow>
              {members.map((m) => (
                <MenuToggleRow
                  key={m.user_id}
                  active={!!f.assignee?.includes(m.user_id)}
                  onSelect={() =>
                    setFilters({ ...f, assignee: toggle(f.assignee, m.user_id) })
                  }
                >
                  <span className="truncate">{displayName(m)}</span>
                </MenuToggleRow>
              ))}
            </>
          )}
        </FilterSub>
        <FilterSub label={tf("effort")} count={f.effort?.length ?? 0}>
          {EFFORTS.map((e) => (
            <MenuToggleRow
              key={e.value}
              active={!!f.effort?.includes(e.value)}
              onSelect={() =>
                setFilters({ ...f, effort: toggle<IssueEffort>(f.effort, e.value) })
              }
            >
              <Triangle className="size-4 text-muted-foreground" />
              {e.label}
            </MenuToggleRow>
          ))}
        </FilterSub>
        {categoryOptions.length > 0 && (
          <FilterSub label={tf("categories")} count={f.category?.length ?? 0}>
            {categoryOptions.map((o) => (
              <MenuToggleRow
                key={o.key}
                active={facetActive(f.category, o.ids)}
                onSelect={() =>
                  setFilters({ ...f, category: toggleFacet(f.category, o.ids) })
                }
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.label}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
        )}
        {objectiveOptions.length > 0 && (
          <FilterSub label={tf("objective")} count={f.objective?.length ?? 0}>
            <MenuToggleRow
              active={!!f.objective?.includes(null)}
              onSelect={() =>
                setFilters({ ...f, objective: toggle(f.objective, null) })
              }
            >
              {tf("noObjective")}
            </MenuToggleRow>
            {objectiveOptions.map((o) => (
              <MenuToggleRow
                key={o.key}
                active={facetActive(f.objective, o.ids)}
                onSelect={() =>
                  setFilters({ ...f, objective: toggleFacet(f.objective, o.ids) })
                }
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.label}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
        )}
        {integrationOptions.length > 0 && (
          <FilterSub label={tf("integration")} count={f.integration?.length ?? 0}>
            <MenuToggleRow
              active={!!f.integration?.includes(null)}
              onSelect={() =>
                setFilters({ ...f, integration: toggle(f.integration, null) })
              }
            >
              {tf("noIntegration")}
            </MenuToggleRow>
            {integrationOptions.map((o) => (
              <MenuToggleRow
                key={o.key}
                active={facetActive(f.integration, o.ids)}
                onSelect={() =>
                  setFilters({ ...f, integration: toggleFacet(f.integration, o.ids) })
                }
              >
                <Plug className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">{o.label}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
        )}

        <DropdownMenuSeparator />
        <MenuToggleRow
          active={!!config.display.hideDone}
          onSelect={() =>
            onChange({
              ...config,
              display: { ...config.display, hideDone: !config.display.hideDone },
            })
          }
        >
          {t("hideDone")}
        </MenuToggleRow>
        <MenuToggleRow
          active={!!config.display.hideRecurring}
          onSelect={() =>
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
        </MenuToggleRow>

        {/* Order — moved into the menu (MIN-592), with the direction invert
            right under the sort list. The invert button does not apply to
            "smart" and "manual": they carry their own order. */}
        <DropdownMenuSeparator />
        <FilterSub label={tf("order")} count={0}>
          {SORTS.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={(event) => {
                event.preventDefault();
                onChange({ ...config, sort: s });
              }}
            >
              {tSort(s)}
              {config.sort === s && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {/* The invert action reads like a checked option (MIN-592 review):
              the icon shows the CURRENT direction (A→Z vs Z→A) and the check
              marks that the direction is the reversed one. Not available for
              "smart" and "manual" — they carry their own order. */}
          <DropdownMenuItem
            disabled={!isDirectionalSort(config.sort)}
            onSelect={(event) => {
              event.preventDefault();
              if (!isDirectionalSort(config.sort)) return;
              onChange({
                ...config,
                display: {
                  ...config.display,
                  sortDirection: reverseSortDirection(sortDirection),
                },
              });
            }}
          >
            {sortDirection === "asc" ? (
              <ArrowDownZA className="text-muted-foreground" />
            ) : (
              <ArrowUpAZ className="text-muted-foreground" />
            )}
            {t("reverseOrder")}
            {sortDirection === "desc" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        </FilterSub>
      </DropdownMenuContent>
    </DropdownMenu>
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
            autoFocus
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

  // ── Context menu of a pill (MIN-135) ────────────────────────────────
  // The same inputs as the “⋯” button, but carried by the clicked view.
  // The dialogs (rename / share / delete) below already accept
  // any view, such as useBoardViews handlers.
  // Any pill opens the menu, including “My tickets” and “Cycle”: the list
  // of actions is the same everywhere, what does not apply is grayed out. A
  // menu that sometimes only appears reads like a bug.
  const openViewMenu = (view: View | null, e: React.MouseEvent) => {
    e.preventDefault();
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
        icon: <ExternalLink className="size-4" />,
        onSelect: () => openViewInNewTab(view),
      },
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
      // A board keeps at least one custom view (same rule as “⋯”).
      disabled: !editable || customCount <= 1,
      onSelect: () => view && setDeleteTarget(view),
    });
    return actions;
  }, [viewMenu, withShare, customCount, t, tActions, openViewInNewTab]);

  return (
    <>
      <AppContentHeader contentClassName="gap-2">
        {/* Views bar — pills (views + Cycle) are drag-reorderable; the "+"
            stays fixed at the end. */}
        <div className="flex shrink-0 items-center gap-1">
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
            {/* Fixed-size copy of the dragged pill (portaled). dropAnimation
                null: the reorder is optimistic, the pill is already in place. */}
            <DragOverlay dropAnimation={null}>
              {activeTabId === CYCLE_TAB_KEY && cycleTab ? (
                <div className={cn(PILL_CLASS, pillTone(cycleTab.active))}>
                  {cycleTab.completionPercent === null ||
                  cycleTab.completionPercent === undefined ? (
                    <IterationCw className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <ProgressRing
                      percent={cycleTab.completionPercent}
                      colorClass="text-emerald-500"
                      className="size-3"
                    />
                  )}
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
                <Plus />
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
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!activeView}
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
              {activeView && (
                <DropdownMenuItem onSelect={() => openViewInNewTab(activeView)}>
                  <ExternalLink />
                  {tActions("openInNewTab")}
                </DropdownMenuItem>
              )}
              {activeView && (!isSystem || withShare) && <DropdownMenuSeparator />}
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
    </>
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
        <Loader2
          className="size-3 shrink-0 animate-spin"
          aria-label={t("viewGenerating")}
        />
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
        <IterationCw className="size-3 shrink-0" aria-hidden />
      ) : (
        <ProgressRing
          percent={completionPercent}
          colorClass="text-emerald-500"
          className="size-3"
        />
      )}
      {t("cycleTab")}
      {external && <ArrowUpRight className="size-3 shrink-0" aria-hidden />}
    </button>
  );
}
