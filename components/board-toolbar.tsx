"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  ListFilter,
  ArrowUpDown,
  MoreHorizontal,
  Plus,
  Save,
  Pencil,
  Trash2,
  Triangle,
  Eye,
} from "lucide-react";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { activeFilterCount } from "@/lib/view-filter";
import { displayName } from "@/lib/display-name";
import type {
  Category,
  Member,
  Objective,
  View,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";

const SORT_LABELS: Record<ViewSort, string> = {
  manual: "Manuel",
  priority: "Priorité",
  created: "Création",
  updated: "Mise à jour",
  due: "Échéance",
};
const SORTS = Object.keys(SORT_LABELS) as ViewSort[];

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
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
}: {
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
}) {
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Filtres">
              <ListFilter className={cn(count > 0 && "text-primary")} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Filtres</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Statut</p>
        {STATUSES.map((s) => (
          <ToggleRow
            key={s.value}
            active={!!f.status?.includes(s.value)}
            onClick={() =>
              setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
            }
          >
            <StatusIndicator status={s.value} className="size-4" />
            {s.label}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Priorité</p>
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
            {p.label}
          </ToggleRow>
        ))}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Assigné</p>
        <ToggleRow
          active={!!f.assignee?.includes(null)}
          onClick={() => setFilters({ ...f, assignee: toggle(f.assignee, null) })}
        >
          Non assigné
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

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Effort</p>
        {EFFORTS.map((e) => (
          <ToggleRow
            key={e.value}
            active={!!f.effort?.includes(e.value)}
            onClick={() =>
              setFilters({ ...f, effort: toggle<IssueEffort>(f.effort, e.value) })
            }
          >
            <Triangle className="size-3.5 text-muted-foreground" />
            {e.label}
          </ToggleRow>
        ))}

        {categories.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Catégorie
            </p>
            {categories.map((c) => (
              <ToggleRow
                key={c.id}
                active={!!f.category?.includes(c.id)}
                onClick={() =>
                  setFilters({ ...f, category: toggle<string>(f.category, c.id) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="truncate">{c.name}</span>
              </ToggleRow>
            ))}
          </>
        )}

        {objectives.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Objectif
            </p>
            <ToggleRow
              active={!!f.objective?.includes(null)}
              onClick={() =>
                setFilters({ ...f, objective: toggle(f.objective, null) })
              }
            >
              Sans objectif
            </ToggleRow>
            {objectives.map((o) => (
              <ToggleRow
                key={o.id}
                active={!!f.objective?.includes(o.id)}
                onClick={() =>
                  setFilters({ ...f, objective: toggle(f.objective, o.id) })
                }
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
                  aria-hidden
                />
                <span className="truncate">{o.name}</span>
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
          Masquer les terminées
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(initialName);
        onOpenChange(next);
      }}
    >
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
              await onSubmit(trimmed);
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
            placeholder="Nom de la vue"
          />
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              Enregistrer
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
  onSelectView,
  config,
  onConfigChange,
  members,
  categories,
  objectives,
  dirty,
  onCreateView,
  onUpdateActiveView,
  onRenameView,
  onDeleteView,
}: {
  views: View[];
  activeViewId: string | null;
  onSelectView: (id: string | null) => void;
  config: ViewConfig;
  onConfigChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  dirty: boolean;
  onCreateView: (name: string) => Promise<void>;
  onUpdateActiveView: () => Promise<void>;
  onRenameView: (view: View, name: string) => Promise<void>;
  onDeleteView: (view: View) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<View | null>(null);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Views bar */}
        <div className="flex flex-wrap items-center gap-1">
          {views.map((v) => (
            <ViewChip
              key={v.id}
              view={v}
              active={v.id === activeViewId}
              canDelete={views.length > 1}
              onSelect={() => onSelectView(v.id)}
              onRename={() => setRenameTarget(v)}
              onDelete={() => void onDeleteView(v)}
            />
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Nouvelle vue"
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nouvelle vue</TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {dirty && activeView && (
            <Button size="sm" onClick={() => void onUpdateActiveView()}>
              <Save />
              Enregistrer
            </Button>
          )}
          {dirty && !activeView && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Save />
              Enregistrer comme vue
            </Button>
          )}

          {/* Order — icon only, accent-coloured when a non-default sort is active */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="Ordre">
                    <ArrowUpDown
                      className={cn(config.sort !== "manual" && "text-primary")}
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Ordre</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() => onConfigChange({ ...config, sort: s })}
                >
                  {SORT_LABELS[s]}
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
          />
        </div>
      </div>

      <ViewNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nouvelle vue"
        initialName=""
        onSubmit={onCreateView}
      />
      <ViewNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title="Renommer la vue"
        initialName={renameTarget?.name ?? ""}
        onSubmit={(name) =>
          renameTarget ? onRenameView(renameTarget, name) : Promise.resolve()
        }
      />
    </div>
  );
}

function ViewChip({
  view,
  active,
  canDelete,
  onSelect,
  onRename,
  onDelete,
}: {
  view: View;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={cn(
        "group relative rounded-full transition-colors",
        active ? "bg-foreground" : "hover:bg-muted"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "rounded-full px-3 py-1 text-sm transition-colors",
          active ? "text-background" : "text-muted-foreground"
        )}
      >
        {view.name}
      </button>

      {/* Per-view actions — revealed on hover, overlaid on the pill's right edge
          (matching bg covers the name) so the layout never shifts. */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options de « ${view.name} »`}
            className={cn(
              "absolute inset-y-0 right-0 flex items-center rounded-r-full pr-1.5 pl-2.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
              menuOpen && "opacity-100",
              active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSelect}>
            <Eye />
            Ouvrir la vue
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            onSelect={onDelete}
          >
            <Trash2 />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
