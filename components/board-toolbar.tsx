"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  Plug,
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
  Integration,
  Member,
  Objective,
  View,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";

const SORTS: ViewSort[] = ["manual", "priority", "created", "updated", "due"];

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
  integrations,
}: {
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  integrations: Integration[];
}) {
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onChange({ ...config, filters: next });
  const count = activeFilterCount(config);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const ts = useTranslations("Status");
  const tp = useTranslations("Priority");

  return (
    <Popover>
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

        {categories.length > 0 && (
          <>
            <Separator className="my-1.5" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              {tf("categories")}
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

        {integrations.length > 0 && (
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
            {integrations.map((i) => (
              <ToggleRow
                key={i.id}
                active={!!f.integration?.includes(i.id)}
                onClick={() =>
                  setFilters({ ...f, integration: toggle(f.integration, i.id) })
                }
              >
                <Plug className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="truncate">{i.name}</span>
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
  const tc = useTranslations("Common");
  const t = useTranslations("Board");

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
            placeholder={t("viewNamePlaceholder")}
          />
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {tc("save")}
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
  integrations,
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
  integrations: Integration[];
  dirty: boolean;
  onCreateView: (name: string) => Promise<void>;
  onUpdateActiveView: () => Promise<void>;
  onRenameView: (view: View, name: string) => Promise<void>;
  onDeleteView: (view: View) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<View | null>(null);
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const tSort = useTranslations("Sort");

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
          {dirty && activeView && (
            <Button size="sm" onClick={() => void onUpdateActiveView()}>
              <Save />
              {tc("save")}
            </Button>
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
          />
        </div>
      </div>

      <ViewNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("newView")}
        initialName=""
        onSubmit={onCreateView}
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
  const t = useTranslations("Board");
  const tc = useTranslations("Common");
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
            aria-label={t("viewOptions", { name: view.name })}
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
            {t("openView")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            {tc("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete}
            onSelect={onDelete}
          >
            <Trash2 />
            {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
