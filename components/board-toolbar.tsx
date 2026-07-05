"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
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
} from "lucide-react";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { activeFilterCount } from "@/lib/view-filter";
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
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListFilter />
          Filtres
          {count > 0 && (
            <Badge variant="secondary" className="ml-1">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-64 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Statut</p>
        {STATUSES.map((s) => {
          const Icon = s.icon;
          return (
            <ToggleRow
              key={s.value}
              active={!!f.status?.includes(s.value)}
              onClick={() =>
                setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
              }
            >
              <Icon className={cn("size-4", s.color)} />
              {s.label}
            </ToggleRow>
          );
        })}

        <Separator className="my-1.5" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Priorité</p>
        {PRIORITIES.map((p) => {
          const Icon = p.icon;
          return (
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
              <Icon className={cn("size-4", p.color)} />
              {p.label}
            </ToggleRow>
          );
        })}

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
            <span className="truncate">{m.full_name || m.email || "Utilisateur"}</span>
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
  const [renameOpen, setRenameOpen] = useState(false);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Views bar */}
        <div className="flex flex-wrap items-center gap-1">
          <ViewChip
            label="Toutes"
            active={activeViewId === null}
            onClick={() => onSelectView(null)}
          />
          {views.map((v) => (
            <ViewChip
              key={v.id}
              label={v.name}
              active={v.id === activeViewId}
              onClick={() => onSelectView(v.id)}
            />
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nouvelle vue"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {dirty && activeView && (
            <Button variant="outline" size="sm" onClick={() => void onUpdateActiveView()}>
              <Save />
              Enregistrer
            </Button>
          )}
          {dirty && !activeView && (
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Save />
              Enregistrer comme vue
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown />
                {SORT_LABELS[config.sort]}
              </Button>
            </DropdownMenuTrigger>
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

          <FiltersPopover
            config={config}
            onChange={onConfigChange}
            members={members}
            categories={categories}
            objectives={objectives}
          />

          {activeView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Gérer la vue">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void onDeleteView(activeView)}
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ViewNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nouvelle vue"
        initialName=""
        onSubmit={onCreateView}
      />
      {activeView && (
        <ViewNameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          title="Renommer la vue"
          initialName={activeView.name}
          onSubmit={(name) => onRenameView(activeView, name)}
        />
      )}
    </div>
  );
}

function ViewChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-sm transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
